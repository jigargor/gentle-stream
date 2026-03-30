import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

interface PipelineAggregate {
  runs: number;
  inserted: number;
  attempted: number;
  candidates: number;
  precheckRejected: number;
  expansions: number;
  inputTokens: number;
  outputTokens: number;
}

interface PipelineComparison {
  runs: number;
  inserted: number;
  attempted: number;
  insertRate: number;
  insertPer1kTokens: number | null;
  duplicateSkipRate: number | null;
}

interface CategoryPipelineComparison {
  category: string;
  legacy: PipelineComparison;
  overhaul: PipelineComparison;
  deltaInsertPer1kTokens: number | null;
  deltaDuplicateSkipRate: number | null;
}

function parseBooleanFilter(value: string | null): boolean | null {
  if (value == null) return null;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return null;
}

function createAggregate(): PipelineAggregate {
  return {
    runs: 0,
    inserted: 0,
    attempted: 0,
    candidates: 0,
    precheckRejected: 0,
    expansions: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function toComparison(agg: PipelineAggregate): PipelineComparison {
  const insertRate = agg.attempted > 0 ? Number((agg.inserted / agg.attempted).toFixed(4)) : 0;
  const insertPer1kTokens =
    agg.inputTokens > 0 ? Number(((agg.inserted * 1000) / agg.inputTokens).toFixed(3)) : null;
  const duplicateSkipRate =
    agg.candidates > 0
      ? Number((agg.precheckRejected / agg.candidates).toFixed(4))
      : agg.attempted > 0
        ? Number((Math.max(0, agg.attempted - agg.inserted) / agg.attempted).toFixed(4))
        : null;

  return {
    runs: agg.runs,
    inserted: agg.inserted,
    attempted: agg.attempted,
    insertRate,
    insertPer1kTokens,
    duplicateSkipRate,
  };
}

function buildCanarySummary(
  rows: Array<{
    category: string;
    pipeline_mode: string | null;
    inserted_count: number | null;
    attempted_count: number | null;
    candidate_count: number | null;
    precheck_rejected_count: number | null;
    expansion_count: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
  }>
): {
  overall: {
    legacy: PipelineComparison;
    overhaul: PipelineComparison;
    deltaInsertPer1kTokens: number | null;
    deltaDuplicateSkipRate: number | null;
  };
  byCategory: CategoryPipelineComparison[];
} {
  const overall = {
    legacy: createAggregate(),
    overhaul: createAggregate(),
  };

  const byCategory = new Map<
    string,
    {
      legacy: PipelineAggregate;
      overhaul: PipelineAggregate;
    }
  >();

  for (const row of rows) {
    const pipelineMode = row.pipeline_mode === "overhaul" ? "overhaul" : "legacy";
    const category = row.category;
    const bucket =
      byCategory.get(category) ??
      {
        legacy: createAggregate(),
        overhaul: createAggregate(),
      };
    byCategory.set(category, bucket);

    const target = bucket[pipelineMode];
    const targetOverall = overall[pipelineMode];
    target.runs += 1;
    target.inserted += row.inserted_count ?? 0;
    target.attempted += row.attempted_count ?? 0;
    target.candidates += row.candidate_count ?? 0;
    target.precheckRejected += row.precheck_rejected_count ?? 0;
    target.expansions += row.expansion_count ?? 0;
    target.inputTokens += row.input_tokens ?? 0;
    target.outputTokens += row.output_tokens ?? 0;

    targetOverall.runs += 1;
    targetOverall.inserted += row.inserted_count ?? 0;
    targetOverall.attempted += row.attempted_count ?? 0;
    targetOverall.candidates += row.candidate_count ?? 0;
    targetOverall.precheckRejected += row.precheck_rejected_count ?? 0;
    targetOverall.expansions += row.expansion_count ?? 0;
    targetOverall.inputTokens += row.input_tokens ?? 0;
    targetOverall.outputTokens += row.output_tokens ?? 0;
  }

  const overallLegacy = toComparison(overall.legacy);
  const overallOverhaul = toComparison(overall.overhaul);

  const byCategorySummary = Array.from(byCategory.entries())
    .map(([category, stats]) => {
      const legacy = toComparison(stats.legacy);
      const overhaul = toComparison(stats.overhaul);
      return {
        category,
        legacy,
        overhaul,
        deltaInsertPer1kTokens:
          legacy.insertPer1kTokens != null && overhaul.insertPer1kTokens != null
            ? Number((overhaul.insertPer1kTokens - legacy.insertPer1kTokens).toFixed(3))
            : null,
        deltaDuplicateSkipRate:
          legacy.duplicateSkipRate != null && overhaul.duplicateSkipRate != null
            ? Number((overhaul.duplicateSkipRate - legacy.duplicateSkipRate).toFixed(4))
            : null,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    overall: {
      legacy: overallLegacy,
      overhaul: overallOverhaul,
      deltaInsertPer1kTokens:
        overallLegacy.insertPer1kTokens != null && overallOverhaul.insertPer1kTokens != null
          ? Number((overallOverhaul.insertPer1kTokens - overallLegacy.insertPer1kTokens).toFixed(3))
          : null,
      deltaDuplicateSkipRate:
        overallLegacy.duplicateSkipRate != null && overallOverhaul.duplicateSkipRate != null
          ? Number((overallOverhaul.duplicateSkipRate - overallLegacy.duplicateSkipRate).toFixed(4))
          : null,
    },
    byCategory: byCategorySummary,
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
      "id,trigger_source,started_at,finished_at,ok,total_inserted,total_attempted,total_skipped,total_failed,total_retried,warning_count,error_summary,categories_checked,total_candidates,total_precheck_rejected,total_expansions,total_input_tokens,total_output_tokens,insert_per_1k_tokens,duplicate_skip_rate,notes"
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (okFilter !== null) runsQuery = runsQuery.eq("ok", okFilter);
  if (fromIso) runsQuery = runsQuery.gte("started_at", fromIso);
  if (toIso) runsQuery = runsQuery.lte("started_at", toIso);

  const { data: runs, error: runsError } = await runsQuery;

  if (runsError) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: `Failed to load runs: ${runsError.message}`,
    });
  }

  const runIds = (runs ?? []).map((run) => run.id);
  if (runIds.length === 0) {
    return NextResponse.json({ ok: true, runs: [] });
  }

  const { data: categoryRows, error: rowsError } = await db
    .from("cron_ingest_category_runs")
    .select(
      "run_id,category,before_count,requested_count,inserted_count,attempted_count,skipped_count,failed_count,retry_count,duration_ms,warning_flag,reason,newest_fetched_at,error_message,error_summary,candidate_count,precheck_rejected_count,expansion_count,input_tokens,output_tokens,insert_per_1k_tokens,duplicate_skip_rate,pipeline_mode,created_at"
    )
    .in("run_id", runIds)
    .order("created_at", { ascending: true });

  if (rowsError) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: `Failed to load category logs: ${rowsError.message}`,
    });
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
      candidateCount: row.candidate_count,
      precheckRejectedCount: row.precheck_rejected_count,
      expansionCount: row.expansion_count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      insertPer1kTokens: row.insert_per_1k_tokens,
      duplicateSkipRate: row.duplicate_skip_rate,
      pipelineMode: row.pipeline_mode,
      createdAt: row.created_at,
    });
    grouped.set(row.run_id, current);
  }

  const canary = buildCanarySummary(
    (categoryRows ?? []).map((row) => ({
      category: row.category as string,
      pipeline_mode: row.pipeline_mode as string | null,
      inserted_count: row.inserted_count as number | null,
      attempted_count: row.attempted_count as number | null,
      candidate_count: row.candidate_count as number | null,
      precheck_rejected_count: row.precheck_rejected_count as number | null,
      expansion_count: row.expansion_count as number | null,
      input_tokens: row.input_tokens as number | null,
      output_tokens: row.output_tokens as number | null,
    }))
  );

  return NextResponse.json({
    ok: true,
    canaryComparison: canary,
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
      totalCandidates: run.total_candidates,
      totalPrecheckRejected: run.total_precheck_rejected,
      totalExpansions: run.total_expansions,
      totalInputTokens: run.total_input_tokens,
      totalOutputTokens: run.total_output_tokens,
      insertPer1kTokens: run.insert_per_1k_tokens,
      duplicateSkipRate: run.duplicate_skip_rate,
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

