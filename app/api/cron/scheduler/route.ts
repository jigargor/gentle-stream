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
  const report: Record<
    string,
    {
      before: number;
      ingested: number;
      newestFetchedAt: string | null;
      reason: "threshold" | "freshness" | "none";
    }
  > = {};
  const nowMs = Date.now();

  for (const cat of CATEGORIES) {
    const row = snapshot[cat];
    const available = row?.count ?? 0;
    const newestFetchedAt = row?.newestFetchedAt ?? null;
    report[cat] = {
      before: available,
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
      console.log(
        `[Scheduler] "${cat}" has ${available} articles (threshold: ${STOCK_THRESHOLD}, target: ${STOCK_TARGET}) — ingesting ${ingestCount}`
      );
      try {
        const result = await runIngestAgent(cat as Category, ingestCount);
        report[cat].ingested = result.inserted.length;
        report[cat].reason = "threshold";
      } catch (e) {
        console.error(`[Scheduler] Ingest failed for "${cat}":`, e);
      }
      continue;
    }

    if (freshnessStale) {
      console.log(
        `[Scheduler] "${cat}" stock is healthy (${available}) but stale (>${FRESHNESS_INGEST_HOURS}h) — ingesting freshness refill`
      );
      try {
        const result = await runIngestAgent(cat as Category, 1);
        report[cat].ingested = result.inserted.length;
        report[cat].reason = "freshness";
      } catch (e) {
        console.error(`[Scheduler] Freshness ingest failed for "${cat}":`, e);
      }
    }
  }

  return NextResponse.json({ ok: true, report, checkedAt: new Date().toISOString() });
}
