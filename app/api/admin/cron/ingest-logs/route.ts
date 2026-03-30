import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

function parseBooleanFilter(value: string | null): boolean | null {
  if (value == null) return null;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return null;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limitParam)))
    : DEFAULT_LIMIT;
  const okFilter = parseBooleanFilter(url.searchParams.get("ok"));
  const fromIso = url.searchParams.get("from");
  const toIso = url.searchParams.get("to");

  let runsQuery = db
    .from("cron_ingest_runs")
    .select(
      "id,trigger_source,started_at,finished_at,ok,total_inserted,total_attempted,total_skipped,total_failed,total_retried,warning_count,error_summary,categories_checked,notes"
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (okFilter !== null) runsQuery = runsQuery.eq("ok", okFilter);
  if (fromIso) runsQuery = runsQuery.gte("started_at", fromIso);
  if (toIso) runsQuery = runsQuery.lte("started_at", toIso);

  const { data: runs, error: runsError } = await runsQuery;

  if (runsError) {
    return NextResponse.json(
      { error: `Failed to load runs: ${runsError.message}` },
      { status: 500 }
    );
  }

  const runIds = (runs ?? []).map((run) => run.id);
  if (runIds.length === 0) {
    return NextResponse.json({ ok: true, runs: [] });
  }

  const { data: categoryRows, error: rowsError } = await db
    .from("cron_ingest_category_runs")
    .select(
      "run_id,category,before_count,requested_count,inserted_count,attempted_count,skipped_count,failed_count,retry_count,duration_ms,warning_flag,reason,newest_fetched_at,error_message,error_summary,created_at"
    )
    .in("run_id", runIds)
    .order("created_at", { ascending: true });

  if (rowsError) {
    return NextResponse.json(
      { error: `Failed to load category logs: ${rowsError.message}` },
      { status: 500 }
    );
  }

  const grouped = new Map<string, unknown[]>();
  for (const row of categoryRows ?? []) {
    const current = grouped.get(row.run_id) ?? [];
    current.push({
      category: row.category,
      beforeCount: row.before_count,
      requestedCount: row.requested_count,
      insertedCount: row.inserted_count,
      attemptedCount: row.attempted_count,
      skippedCount: row.skipped_count,
      failedCount: row.failed_count,
      retryCount: row.retry_count,
      durationMs: row.duration_ms,
      warning: row.warning_flag,
      reason: row.reason,
      newestFetchedAt: row.newest_fetched_at,
      errorMessage: row.error_message,
      errorSummary: row.error_summary,
      createdAt: row.created_at,
    });
    grouped.set(row.run_id, current);
  }

  return NextResponse.json({
    ok: true,
    runs: (runs ?? []).map((run) => ({
      id: run.id,
      triggerSource: run.trigger_source,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      ok: run.ok,
      totalInserted: run.total_inserted,
      totalAttempted: run.total_attempted,
      totalSkipped: run.total_skipped,
      totalFailed: run.total_failed,
      totalRetried: run.total_retried,
      warningCount: run.warning_count,
      errorSummary: run.error_summary,
      categoriesChecked: run.categories_checked,
      notes: run.notes,
      health: {
        isPartialFailure:
          (run.total_attempted ?? 0) > 0 && (run.total_failed ?? 0) > 0,
        hasWarnings: (run.warning_count ?? 0) > 0,
      },
      categories: grouped.get(run.id) ?? [],
    })),
  });
}

