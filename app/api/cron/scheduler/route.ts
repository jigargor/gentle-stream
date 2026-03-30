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

  const runStartedAt = Date.now();
  const triggerSource = request.headers.get("x-vercel-cron") ? "vercel-cron" : "manual";
  let runId: string;
  try {
    runId = await createCronIngestRun(triggerSource);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not create ingest run: ${message}` },
      { status: 500 }
    );
  }

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
  let hadErrors = false;
  let warningCount = 0;
  let totalInserted = 0;
  let totalAttempted = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalRetried = 0;
  const errorSummaryParts: string[] = [];

  try {
    const snapshot = await getAvailableStockSnapshotByCategory();
    const nowMs = Date.now();

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

      let ingestCount = 0;
      let reason: "threshold" | "freshness" | "none" = "none";
      if (available < STOCK_THRESHOLD) {
        const deficitToTarget = Math.max(INGEST_BATCH_SIZE, STOCK_TARGET - available);
        ingestCount = Math.min(STOCK_TOP_UP_MAX_PER_RUN, deficitToTarget);
        reason = "threshold";
      } else if (freshnessStale) {
        ingestCount = 2;
        reason = "freshness";
      }

      report[cat].requested = ingestCount;
      report[cat].reason = reason;

      if (ingestCount === 0) {
        categoryLogs.push({
          category: cat,
          beforeCount: available,
          requestedCount: 0,
          insertedCount: 0,
          attemptedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          retryCount: 0,
          durationMs: 0,
          warningFlag: false,
          reason,
          newestFetchedAt,
        });
        continue;
      }

      console.log(
        reason === "threshold"
          ? `[Scheduler] "${cat}" has ${available} articles (threshold: ${STOCK_THRESHOLD}, target: ${STOCK_TARGET}) — ingesting ${ingestCount}`
          : `[Scheduler] "${cat}" stock is healthy (${available}) but stale (>${FRESHNESS_INGEST_HOURS}h) — ingesting freshness refill (${ingestCount})`
      );

      const categoryStartedAt = Date.now();
      try {
        const result = await runIngestAgent(cat as Category, ingestCount);
        const insertedCount = result.inserted.length;
        const warningFlag =
          result.failedCount > 0 || (ingestCount > 0 && insertedCount === 0);
        if (warningFlag) warningCount += 1;

        report[cat].ingested = insertedCount;
        if (result.errorSummary) report[cat].error = result.errorSummary;

        totalInserted += insertedCount;
        totalAttempted += result.attemptedCount;
        totalSkipped += result.skippedCount;
        totalFailed += result.failedCount;
        totalRetried += result.retryCount;

        if (result.errorSummary) {
          errorSummaryParts.push(`${cat}: ${result.errorSummary}`);
        }

        categoryLogs.push({
          category: cat,
          beforeCount: available,
          requestedCount: ingestCount,
          insertedCount,
          attemptedCount: result.attemptedCount,
          skippedCount: result.skippedCount,
          failedCount: result.failedCount,
          retryCount: result.retryCount,
          durationMs: result.durationMs || Date.now() - categoryStartedAt,
          warningFlag,
          reason,
          newestFetchedAt,
          errorMessage: report[cat].error,
          errorSummary: result.errorSummary ?? undefined,
        });
      } catch (e) {
        console.error(`[Scheduler] Ingest failed for "${cat}":`, e);
        hadErrors = true;
        const message = e instanceof Error ? e.message : "Unknown ingest error";
        report[cat].error = message;
        errorSummaryParts.push(`${cat}: ${message}`);
        totalFailed += ingestCount;
        warningCount += 1;

        categoryLogs.push({
          category: cat,
          beforeCount: available,
          requestedCount: ingestCount,
          insertedCount: 0,
          attemptedCount: ingestCount,
          skippedCount: 0,
          failedCount: ingestCount,
          retryCount: 0,
          durationMs: Date.now() - categoryStartedAt,
          warningFlag: true,
          reason,
          newestFetchedAt,
          errorMessage: message,
          errorSummary: message,
        });
      }
    }
  } catch (e) {
    hadErrors = true;
    errorSummaryParts.push(
      e instanceof Error ? e.message : "Scheduler loop failed"
    );
  } finally {
    try {
      await appendCronIngestCategoryLogs(runId, categoryLogs);
    } catch (e) {
      hadErrors = true;
      errorSummaryParts.push(
        e instanceof Error ? e.message : "Could not append category logs"
      );
    }

    const notes = `durationMs=${Date.now() - runStartedAt}; categories=${CATEGORIES.length}`;
    try {
      await finishCronIngestRun(runId, {
        ok: !hadErrors,
        totalInserted,
        totalAttempted,
        totalSkipped,
        totalFailed,
        totalRetried,
        warningCount,
        errorSummary: errorSummaryParts.join(" | ").slice(0, 1200),
        categoriesChecked: CATEGORIES.length,
        notes,
      });
    } catch (e) {
      console.error("[Scheduler] Could not finish ingest run:", e);
    }
  }

  return NextResponse.json({
    ok: !hadErrors,
    runId,
    totalInserted,
    totals: {
      attempted: totalAttempted,
      skipped: totalSkipped,
      failed: totalFailed,
      retried: totalRetried,
      warnings: warningCount,
    },
    report,
    checkedAt: new Date().toISOString(),
  });
}
