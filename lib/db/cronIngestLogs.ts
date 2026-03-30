import { db } from "./client";

export interface CronIngestCategoryLogInput {
  category: string;
  beforeCount: number;
  requestedCount: number;
  insertedCount: number;
  attemptedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  retryCount?: number;
  durationMs?: number;
  warningFlag?: boolean;
  reason: "threshold" | "freshness" | "none";
  newestFetchedAt: string | null;
  errorMessage?: string;
  errorSummary?: string;
  candidateCount?: number;
  precheckRejectedCount?: number;
  expansionCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  insertPer1kTokens?: number;
  duplicateSkipRate?: number;
  pipelineMode?: "legacy" | "overhaul";
}

export async function createCronIngestRun(triggerSource = "vercel-cron"): Promise<string> {
  const { data, error } = await db
    .from("cron_ingest_runs")
    .insert({ trigger_source: triggerSource })
    .select("id")
    .single();

  if (error || !data?.id) throw new Error(`createCronIngestRun: ${error?.message ?? "Unknown error"}`);
  return data.id as string;
}

export async function appendCronIngestCategoryLogs(
  runId: string,
  logs: CronIngestCategoryLogInput[]
): Promise<void> {
  if (logs.length === 0) return;

  const rows = logs.map((entry) => ({
    run_id: runId,
    category: entry.category,
    before_count: entry.beforeCount,
    requested_count: entry.requestedCount,
    inserted_count: entry.insertedCount,
    attempted_count: entry.attemptedCount ?? 0,
    skipped_count: entry.skippedCount ?? 0,
    failed_count: entry.failedCount ?? 0,
    retry_count: entry.retryCount ?? 0,
    duration_ms: entry.durationMs ?? 0,
    warning_flag: entry.warningFlag ?? false,
    reason: entry.reason,
    newest_fetched_at: entry.newestFetchedAt,
    error_message: entry.errorMessage ?? null,
    error_summary: entry.errorSummary ?? null,
    candidate_count: entry.candidateCount ?? 0,
    precheck_rejected_count: entry.precheckRejectedCount ?? 0,
    expansion_count: entry.expansionCount ?? 0,
    input_tokens: entry.inputTokens ?? 0,
    output_tokens: entry.outputTokens ?? 0,
    insert_per_1k_tokens: entry.insertPer1kTokens ?? 0,
    duplicate_skip_rate: entry.duplicateSkipRate ?? 0,
    pipeline_mode: entry.pipelineMode ?? "legacy",
  }));

  const { error } = await db.from("cron_ingest_category_runs").insert(rows);
  if (error) throw new Error(`appendCronIngestCategoryLogs: ${error.message}`);
}

export async function finishCronIngestRun(
  runId: string,
  payload: {
    ok: boolean;
    totalInserted: number;
    totalAttempted?: number;
    totalSkipped?: number;
    totalFailed?: number;
    totalRetried?: number;
    warningCount?: number;
    errorSummary?: string;
    categoriesChecked: number;
    totalCandidates?: number;
    totalPrecheckRejected?: number;
    totalExpansions?: number;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    insertPer1kTokens?: number;
    duplicateSkipRate?: number;
    notes?: string;
  }
): Promise<void> {
  const { error } = await db
    .from("cron_ingest_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: payload.ok,
      total_inserted: payload.totalInserted,
      total_attempted: payload.totalAttempted ?? 0,
      total_skipped: payload.totalSkipped ?? 0,
      total_failed: payload.totalFailed ?? 0,
      total_retried: payload.totalRetried ?? 0,
      warning_count: payload.warningCount ?? 0,
      error_summary: payload.errorSummary ?? null,
      categories_checked: payload.categoriesChecked,
      total_candidates: payload.totalCandidates ?? 0,
      total_precheck_rejected: payload.totalPrecheckRejected ?? 0,
      total_expansions: payload.totalExpansions ?? 0,
      total_input_tokens: payload.totalInputTokens ?? 0,
      total_output_tokens: payload.totalOutputTokens ?? 0,
      insert_per_1k_tokens: payload.insertPer1kTokens ?? 0,
      duplicate_skip_rate: payload.duplicateSkipRate ?? 0,
      notes: payload.notes ?? null,
    })
    .eq("id", runId);

  if (error) throw new Error(`finishCronIngestRun: ${error.message}`);
}

