import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limitParam)))
    : DEFAULT_LIMIT;

  const { data: runs, error: runsError } = await db
    .from("cron_ingest_runs")
    .select("id,trigger_source,started_at,finished_at,ok,total_inserted,categories_checked,notes")
    .order("started_at", { ascending: false })
    .limit(limit);

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
      "run_id,category,before_count,requested_count,inserted_count,reason,newest_fetched_at,error_message,created_at"
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
      reason: row.reason,
      newestFetchedAt: row.newest_fetched_at,
      errorMessage: row.error_message,
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
      categoriesChecked: run.categories_checked,
      notes: run.notes,
      categories: grouped.get(run.id) ?? [],
    })),
  });
}

