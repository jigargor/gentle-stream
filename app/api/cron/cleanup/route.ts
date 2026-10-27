/**
 * GET /api/cron/cleanup
 *
 * Article TTL cleanup remains disabled.
 * Prunes operational tables (rate limits, soft-seen, old logs) to limit Disk IO.
 *
 * Protect with CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { captureException, flushOnShutdown, startSpan } from "@/lib/observability";
import { logInfo, logWarning } from "@/lib/observability/logger";

interface PruneResultRow {
  rate_limit_windows_deleted: number | string;
  soft_seen_deleted: number | string;
  llm_provider_calls_deleted: number | string;
  cron_ingest_runs_deleted: number | string;
}

async function pruneOperationalTablesFallback(): Promise<PruneResultRow> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const rate = await db
    .from("rate_limit_windows")
    .delete({ count: "exact" })
    .lt("updated_at", twoHoursAgo);
  const soft = await db
    .from("user_seen_articles")
    .delete({ count: "exact" })
    .eq("source", "ranker_soft")
    .lt("seen_at", sevenDaysAgo);
  const llm = await db
    .from("llm_provider_calls")
    .delete({ count: "exact" })
    .lt("created_at", thirtyDaysAgo);
  const cron = await db
    .from("cron_ingest_runs")
    .delete({ count: "exact" })
    .lt("started_at", thirtyDaysAgo);

  if (rate.error) throw new Error(`prune rate_limit_windows: ${rate.error.message}`);
  if (soft.error) throw new Error(`prune user_seen_articles: ${soft.error.message}`);
  if (llm.error) throw new Error(`prune llm_provider_calls: ${llm.error.message}`);
  if (cron.error) throw new Error(`prune cron_ingest_runs: ${cron.error.message}`);

  return {
    rate_limit_windows_deleted: rate.count ?? 0,
    soft_seen_deleted: soft.count ?? 0,
    llm_provider_calls_deleted: llm.count ?? 0,
    cron_ingest_runs_deleted: cron.count ?? 0,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  try {
    const span = startSpan("cron.cleanup", {
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });

    let pruned: PruneResultRow;
    const { data, error } = await db.rpc("prune_operational_tables");
    if (!error && Array.isArray(data) && data.length > 0) {
      pruned = data[0] as PruneResultRow;
    } else {
      if (error) {
        logWarning("cron.cleanup.prune_rpc_unavailable", {
          message: error.message,
        });
      }
      pruned = await pruneOperationalTablesFallback();
    }

    const summary = {
      rateLimitWindowsDeleted: Number(pruned.rate_limit_windows_deleted) || 0,
      softSeenDeleted: Number(pruned.soft_seen_deleted) || 0,
      llmProviderCallsDeleted: Number(pruned.llm_provider_calls_deleted) || 0,
      cronIngestRunsDeleted: Number(pruned.cron_ingest_runs_deleted) || 0,
    };
    logInfo("cron.cleanup.pruned", summary);
    span.end({ skippedArticlesTtl: true, ...summary });
    await flushOnShutdown();
    return NextResponse.json({
      ok: true,
      deleted: 0,
      skipped: true,
      reason: "article TTL cleanup disabled",
      pruned: summary,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    captureException(error, {
      route: "cron.cleanup",
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    await flushOnShutdown();
    return internalErrorResponse({ request, error });
  }
}
