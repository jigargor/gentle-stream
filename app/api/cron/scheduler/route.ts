/**
 * GET /api/cron/scheduler
 *
 * Checks article stock per category. For any category below STOCK_THRESHOLD,
 * triggers the ingest agent. Designed to run on a schedule (e.g. every 30 min).
 *
 * On Vercel: add to vercel.json crons array (see README).
 * Protect with CRON_SECRET so only the scheduler can call it.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { getAvailableStockSnapshotByCategory } from "@/lib/db/articles";
import { runIngestAgent } from "@/lib/agents/ingestAgent";
import {
  appendCronIngestCategoryLogs,
  createCronIngestRun,
  finishCronIngestRun,
  type CronIngestCategoryLogInput,
} from "@/lib/db/cronIngestLogs";
import {
  CATEGORIES,
  FRESHNESS_INGEST_HOURS,
  INGEST_BATCH_SIZE,
  STOCK_TARGET,
  STOCK_THRESHOLD,
  STOCK_TOP_UP_MAX_PER_RUN,
} from "@/lib/constants";
import type { Category } from "@/lib/constants";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getAvailableStockSnapshotByCategory();
  const runStartedAt = Date.now();
  const triggerSource = request.headers.get("x-vercel-cron") ? "vercel-cron" : "manual";
  const runId = await createCronIngestRun(triggerSource);

  const report: Record<
    string,
    {
      before: number;
      requested: number;
      ingested: number;
      newestFetchedAt: string | null;
      reason: "threshold" | "freshness" | "none";
      error?: string;
    }
  > = {};
  const categoryLogs: CronIngestCategoryLogInput[] = [];
  const nowMs = Date.now();
  let hadErrors = false;

  for (const cat of CATEGORIES) {
    const row = snapshot[cat];
    const available = row?.count ?? 0;
    const newestFetchedAt = row?.newestFetchedAt ?? null;
    report[cat] = {
      before: available,
      requested: 0,
      ingested: 0,
      newestFetchedAt,
      reason: "none",
    };

    const freshnessStale =
      newestFetchedAt == null ||
      nowMs - Date.parse(newestFetchedAt) >
        FRESHNESS_INGEST_HOURS * 60 * 60 * 1000;

    if (available < STOCK_THRESHOLD) {
      const deficitToTarget = Math.max(INGEST_BATCH_SIZE, STOCK_TARGET - available);
      const ingestCount = Math.min(STOCK_TOP_UP_MAX_PER_RUN, deficitToTarget);
      report[cat].requested = ingestCount;
      console.log(
        `[Scheduler] "${cat}" has ${available} articles (threshold: ${STOCK_THRESHOLD}, target: ${STOCK_TARGET}) — ingesting ${ingestCount}`
      );
      try {
        const result = await runIngestAgent(cat as Category, ingestCount);
        report[cat].ingested = result.inserted.length;
        report[cat].reason = "threshold";
      } catch (e) {
        console.error(`[Scheduler] Ingest failed for "${cat}":`, e);
        hadErrors = true;
        report[cat].error = e instanceof Error ? e.message : "Unknown ingest error";
      }
      categoryLogs.push({
        category: cat,
        beforeCount: available,
        requestedCount: ingestCount,
        insertedCount: report[cat].ingested,
        reason: report[cat].reason,
        newestFetchedAt,
        errorMessage: report[cat].error,
      });
      continue;
    }

    if (freshnessStale) {
      const ingestCount = 2;
      report[cat].requested = ingestCount;
      console.log(
        `[Scheduler] "${cat}" stock is healthy (${available}) but stale (>${FRESHNESS_INGEST_HOURS}h) — ingesting freshness refill (${ingestCount})`
      );
      try {
        const result = await runIngestAgent(cat as Category, ingestCount);
        report[cat].ingested = result.inserted.length;
        report[cat].reason = "freshness";
      } catch (e) {
        console.error(`[Scheduler] Freshness ingest failed for "${cat}":`, e);
        hadErrors = true;
        report[cat].error = e instanceof Error ? e.message : "Unknown freshness ingest error";
      }
    }

    categoryLogs.push({
      category: cat,
      beforeCount: available,
      requestedCount: report[cat].requested,
      insertedCount: report[cat].ingested,
      reason: report[cat].reason,
      newestFetchedAt,
      errorMessage: report[cat].error,
    });
  }

  const totalInserted = Object.values(report).reduce((sum, row) => sum + row.ingested, 0);
  const notes = `durationMs=${Date.now() - runStartedAt}; categories=${CATEGORIES.length}`;
  await appendCronIngestCategoryLogs(runId, categoryLogs);
  await finishCronIngestRun(runId, {
    ok: !hadErrors,
    totalInserted,
    categoriesChecked: CATEGORIES.length,
    notes,
  });

  return NextResponse.json({
    ok: !hadErrors,
    runId,
    totalInserted,
    report,
    checkedAt: new Date().toISOString(),
  });
}
