import { db } from "./client";

export interface CronIngestCategoryLogInput {
  category: string;
  beforeCount: number;
  requestedCount: number;
  insertedCount: number;
  reason: "threshold" | "freshness" | "none";
  newestFetchedAt: string | null;
  errorMessage?: string;
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
    reason: entry.reason,
    newest_fetched_at: entry.newestFetchedAt,
    error_message: entry.errorMessage ?? null,
  }));

  const { error } = await db.from("cron_ingest_category_runs").insert(rows);
  if (error) throw new Error(`appendCronIngestCategoryLogs: ${error.message}`);
}

export async function finishCronIngestRun(
  runId: string,
  payload: {
    ok: boolean;
    totalInserted: number;
    categoriesChecked: number;
    notes?: string;
  }
): Promise<void> {
  const { error } = await db
    .from("cron_ingest_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok: payload.ok,
      total_inserted: payload.totalInserted,
      categories_checked: payload.categoriesChecked,
      notes: payload.notes ?? null,
    })
    .eq("id", runId);

  if (error) throw new Error(`finishCronIngestRun: ${error.message}`);
}

