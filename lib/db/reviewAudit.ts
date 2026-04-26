import { db } from "@/lib/db/client";
import type { ReviewFindingRecord, ReviewRunRecord } from "@/lib/codereview/types";

export async function insertReviewRun(record: ReviewRunRecord): Promise<string> {
  const { data, error } = await db
    .from("review_runs")
    .insert({
      repository: record.repository,
      branch: record.branch,
      pr_number: record.prNumber,
      commit_sha: record.commitSha,
      mode: record.mode,
      prompt_template_id: record.promptTemplateId,
      context_package_hash: record.contextPackageHash,
      reviewer_models: record.reviewerModels,
      adjudicator_model: record.adjudicatorModel,
      token_usage_by_model: record.tokenUsageByModel,
      latency_ms_by_model: record.latencyMsByModel,
      estimated_cost_usd_by_model: record.estimatedCostUsdByModel,
      metadata: {
        runId: record.runId,
        timestampIso: record.timestampIso,
      },
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not insert review run");
  return data.id as string;
}

export async function insertReviewFindings(
  reviewRunId: string,
  findings: ReviewFindingRecord[]
): Promise<void> {
  if (findings.length === 0) return;
  const rows = findings.map((finding) => ({
    review_run_id: reviewRunId,
    finding_key: finding.findingId,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: finding.evidence,
    source_model: finding.sourceModel,
    title: finding.title,
    details: JSON.stringify({
      validity: finding.validity,
      significance: finding.significance,
      lifecycle: finding.lifecycle,
    }),
  }));
  const { error } = await db.from("review_findings").insert(rows);
  if (error) throw new Error(error.message);
}

export async function insertReviewFindingOutcomes(input: {
  findingId: string;
  validity: "unknown" | "confirmed" | "rejected";
  significance: "critical" | "high" | "medium" | "low";
  lifecycleStage: "suggested" | "accepted" | "fixed" | "verified";
  updatedBy?: string;
  notes?: string;
}): Promise<void> {
  const { error } = await db.from("review_finding_outcomes").insert({
    review_finding_id: input.findingId,
    validity: input.validity,
    significance: input.significance,
    lifecycle_stage: input.lifecycleStage,
    updated_by: input.updatedBy ?? null,
    notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
}
