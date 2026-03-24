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
import { countAvailableByCategory } from "@/lib/db/articles";
import { runIngestAgent } from "@/lib/agents/ingestAgent";
import { CATEGORIES, STOCK_THRESHOLD } from "@/lib/constants";
import type { Category } from "@/lib/constants";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const counts = await countAvailableByCategory();
  const report: Record<string, { before: number; ingested: number }> = {};

  for (const cat of CATEGORIES) {
    const available = counts[cat] ?? 0;
    report[cat] = { before: available, ingested: 0 };

    if (available < STOCK_THRESHOLD) {
      console.log(
        `[Scheduler] "${cat}" has ${available} articles (threshold: ${STOCK_THRESHOLD}) — ingesting`
      );
      try {
        const result = await runIngestAgent(cat as Category);
        report[cat].ingested = result.inserted.length;
      } catch (e) {
        console.error(`[Scheduler] Ingest failed for "${cat}":`, e);
      }
    }
  }

  return NextResponse.json({ ok: true, report, checkedAt: new Date().toISOString() });
}
