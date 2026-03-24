/**
 * GET /api/cron/games
 *
 * Grows precomputed game pools continuously (within caps).
 * Runs on a schedule via vercel.json.
 *
 * Requires x-cron-secret header matching CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCrosswordPoolSize,
} from "@/lib/games/crosswordIngestAgent";
import {
  runBlockedCrosswordIngest,
  MAX_CROSSWORDS_IN_POOL,
} from "@/lib/games/blockedCrosswordIngestAgent";
import {
  runConnectionsIngest,
  getConnectionsPoolSize,
} from "@/lib/games/connectionsIngestAgent";
import {
  runWordSearchPoolIngest,
  shouldRunWordPoolIngest,
} from "@/lib/games/wordSearchPoolIngestAgent";
import {
  getWordPoolTotalCount,
  MIN_WORD_POOL_TOTAL,
} from "@/lib/db/gameWordPool";

/**
 * Word-pool cap for demo: keep growth bounded while still ensuring freshness.
 * (Crosswords are capped separately in blockedCrosswordIngestAgent.)
 */
const MAX_WORD_POOL_TOTAL = 1500;
const MAX_CONNECTIONS_IN_POOL = 300;

async function growConnectionsPool(): Promise<{
  before: number;
  inserted: number;
  after: number;
  skipped: boolean;
}> {
  const before = await getConnectionsPoolSize();
  if (before >= MAX_CONNECTIONS_IN_POOL) {
    return { before, inserted: 0, after: before, skipped: true };
  }
  const inserted = await runConnectionsIngest();
  const after = await getConnectionsPoolSize();
  return { before, inserted, after, skipped: false };
}

async function growCrosswordPool(): Promise<{
  before: number;
  inserted: number;
  after: number;
  skipped: boolean;
}> {
  const before = await getCrosswordPoolSize();
  if (before >= MAX_CROSSWORDS_IN_POOL) {
    return { before, inserted: 0, after: before, skipped: true };
  }
  const inserted = await runBlockedCrosswordIngest();
  const after = await getCrosswordPoolSize();
  return { before, inserted, after, skipped: false };
}

async function growWordPool(): Promise<{
  before: number;
  inserted: number;
  after: number;
  skipped: boolean;
}> {
  const before = await getWordPoolTotalCount();
  const belowMin = await shouldRunWordPoolIngest();
  if (before >= MAX_WORD_POOL_TOTAL || (!belowMin && before >= MIN_WORD_POOL_TOTAL)) {
    return { before, inserted: 0, after: before, skipped: true };
  }
  const inserted = await runWordSearchPoolIngest();
  const after = await getWordPoolTotalCount();
  return { before, inserted, after, skipped: false };
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── Crosswords (blocked minis) ──────────────────────────────────────────────
  try {
    const r = await growCrosswordPool();
    results.crossword = {
      ...r,
      cap: MAX_CROSSWORDS_IN_POOL,
    };
  } catch (e) {
    results.crossword = { error: e instanceof Error ? e.message : "failed" };
  }

  // ── Connections ──────────────────────────────────────────────────────────────
  try {
    const r = await growConnectionsPool();
    results.connections = {
      ...r,
      cap: MAX_CONNECTIONS_IN_POOL,
    };
  } catch (e) {
    results.connections = { error: e instanceof Error ? e.message : "failed" };
  }

  // ── Word-search word pool ────────────────────────────────────────────────────
  try {
    const r = await growWordPool();
    results.wordPool = {
      ...r,
      minTarget: MIN_WORD_POOL_TOTAL,
      cap: MAX_WORD_POOL_TOTAL,
    };
  } catch (e) {
    results.wordPool = { error: e instanceof Error ? e.message : "failed" };
  }

  return NextResponse.json({
    message: "Games cron complete",
    ranAt: new Date().toISOString(),
    results,
  });
}
