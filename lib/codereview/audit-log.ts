import { promises as fs } from "fs";
import path from "path";
import type { ReviewRunRecord } from "./types";

function resolveAuditPath(fileName: string): string {
  return path.join(process.cwd(), ".cursor", "code-review", fileName);
}

async function ensureAuditDir(): Promise<void> {
  await fs.mkdir(path.join(process.cwd(), ".cursor", "code-review"), {
    recursive: true,
  });
}

async function appendJsonl(filePath: string, row: unknown): Promise<void> {
  await ensureAuditDir();
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, "utf8");
}

export async function appendReviewRunAudit(record: ReviewRunRecord): Promise<void> {
  const filePath = resolveAuditPath("review-runs.jsonl");
  await appendJsonl(filePath, record);
}

export async function appendReviewSummaryAudit(input: {
  runId: string;
  prNumber: number;
  commitSha: string;
  modelsUsed: string[];
  confirmedFindings: number;
  rejectedFindings: number;
  highSeverityConfirmed: number;
  costPerValidHighSeverityFindingUsd: number | null;
}): Promise<void> {
  const filePath = resolveAuditPath("review-summaries.jsonl");
  await appendJsonl(filePath, {
    ...input,
    timestampIso: new Date().toISOString(),
  });
}
