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
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureException, flushOnShutdown, startSpan } from "@/lib/observability";

/**
 * Word-pool cap for demo: keep growth bounded while still ensuring freshness.
 * (Crosswords are capped separately in blockedCrosswordIngestAgent.)
 */
const MAX_WORD_POOL_TOTAL = 1500;
const MAX_CONNECTIONS_IN_POOL = 300;
/** Below this, run a second ingest pass in the same cron if still under cap (recovers from partial failures). */
const CONNECTIONS_POOL_CRITICAL_LOW = 24;

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

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
  let inserted = await runConnectionsIngest();
  let after = await getConnectionsPoolSize();
  // Second pass when the pool is still small (e.g. some categories failed silently).
  if (
    after < CONNECTIONS_POOL_CRITICAL_LOW &&
    after < MAX_CONNECTIONS_IN_POOL
  ) {
    const second = await runConnectionsIngest();
    inserted += second;
    after = await getConnectionsPoolSize();
  }
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
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const results: Record<string, unknown> = {};
  const llmGamesEnabled =
    process.env.CRON_GAMES_LLM_ENABLED == null
      ? false
      : isTruthy(process.env.CRON_GAMES_LLM_ENABLED);
  const span = startSpan("cron.games", {
    traceId: request.headers.get("x-trace-id") ?? undefined,
  });

  // ── Crosswords (blocked minis) ──────────────────────────────────────────────
  try {
    const r = await growCrosswordPool();
    results.crossword = {
      ...r,
      cap: MAX_CROSSWORDS_IN_POOL,
    };
  } catch (e) {
    captureException(e, { route: "cron.games", pool: "crossword" });
    results.crossword = { error: e instanceof Error ? e.message : "failed" };
  }

  // ── Connections ──────────────────────────────────────────────────────────────
  if (!llmGamesEnabled) {
    results.connections = {
      skipped: true,
      reason: "CRON_GAMES_LLM_ENABLED is off",
      cap: MAX_CONNECTIONS_IN_POOL,
    };
  } else {
    try {
      const r = await growConnectionsPool();
      results.connections = {
        ...r,
        cap: MAX_CONNECTIONS_IN_POOL,
      };
    } catch (e) {
      captureException(e, { route: "cron.games", pool: "connections" });
      results.connections = { error: e instanceof Error ? e.message : "failed" };
    }
  }

  // ── Word-search word pool ────────────────────────────────────────────────────
  if (!llmGamesEnabled) {
    results.wordPool = {
      skipped: true,
      reason: "CRON_GAMES_LLM_ENABLED is off",
      minTarget: MIN_WORD_POOL_TOTAL,
      cap: MAX_WORD_POOL_TOTAL,
    };
  } else {
    try {
      const r = await growWordPool();
      results.wordPool = {
        ...r,
        minTarget: MIN_WORD_POOL_TOTAL,
        cap: MAX_WORD_POOL_TOTAL,
      };
    } catch (e) {
      captureException(e, { route: "cron.games", pool: "word_pool" });
      results.wordPool = { error: e instanceof Error ? e.message : "failed" };
    }
  }

  span.end({ ok: true });
  await flushOnShutdown();
  return NextResponse.json({
    message: "Games cron complete",
    llmGamesEnabled,
    ranAt: new Date().toISOString(),
    results,
  });
}
