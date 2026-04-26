import { promises as fs } from "fs";
import path from "path";
import { appendReviewRunAudit, appendReviewSummaryAudit } from "@/lib/codereview/audit-log";
import type { ReviewRunRecord } from "@/lib/codereview/types";

function parseArgs(): { inputPath: string } {
  const inputArg = process.argv.find((arg) => arg.startsWith("--input="));
  if (!inputArg) throw new Error("Missing --input=/path/to/review-run.json");
  return { inputPath: inputArg.slice("--input=".length) };
}

function summarize(record: ReviewRunRecord) {
  const confirmedFindings = record.findings.filter(
    (finding) => finding.validity === "confirmed"
  );
  const rejectedFindings = record.findings.filter(
    (finding) => finding.validity === "rejected"
  );
  const highSeverityConfirmed = confirmedFindings.filter((finding) =>
    finding.significance === "critical" || finding.significance === "high"
  );
  const totalCost = Object.values(record.estimatedCostUsdByModel).reduce(
    (sum, value) => sum + value,
    0
  );
  return {
    confirmedFindings: confirmedFindings.length,
    rejectedFindings: rejectedFindings.length,
    highSeverityConfirmed: highSeverityConfirmed.length,
    costPerValidHighSeverityFindingUsd:
      highSeverityConfirmed.length > 0
        ? Number((totalCost / highSeverityConfirmed.length).toFixed(4))
        : null,
  };
}

async function main() {
  const { inputPath } = parseArgs();
  const absolutePath = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(process.cwd(), inputPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const reviewRun = JSON.parse(raw) as ReviewRunRecord;
  await appendReviewRunAudit(reviewRun);
  const summary = summarize(reviewRun);
  await appendReviewSummaryAudit({
    runId: reviewRun.runId,
    prNumber: reviewRun.prNumber,
    commitSha: reviewRun.commitSha,
    modelsUsed: reviewRun.reviewerModels.map((model) => `${model.provider}:${model.model}`),
    confirmedFindings: summary.confirmedFindings,
    rejectedFindings: summary.rejectedFindings,
    highSeverityConfirmed: summary.highSeverityConfirmed,
    costPerValidHighSeverityFindingUsd: summary.costPerValidHighSeverityFindingUsd,
  });
  console.log(
    `Logged review run ${reviewRun.runId} for PR #${reviewRun.prNumber} (${reviewRun.commitSha.slice(0, 12)})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
