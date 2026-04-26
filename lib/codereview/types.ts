export type ReviewMode = "standard" | "max";
export type ReviewProvider = "anthropic" | "openai" | "gemini";
export type ReviewSeverity = "critical" | "high" | "medium" | "low";
export type ReviewValidity = "unknown" | "confirmed" | "rejected";
export type ReviewCategory =
  | "security"
  | "correctness"
  | "data_loss"
  | "performance"
  | "reliability"
  | "style";

export interface ReviewModelRef {
  provider: ReviewProvider;
  model: string;
  version?: string | null;
}

export interface ReviewFindingRecord {
  findingId: string;
  title: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  confidence: number;
  evidence: string[];
  sourceModel: ReviewModelRef;
  validity: ReviewValidity;
  significance: ReviewSeverity;
  lifecycle: Array<"suggested" | "accepted" | "fixed" | "verified">;
}

export interface ReviewRunRecord {
  runId: string;
  repository: string;
  branch: string;
  prNumber: number;
  commitSha: string;
  mode: ReviewMode;
  timestampIso: string;
  reviewerModels: ReviewModelRef[];
  adjudicatorModel: ReviewModelRef;
  promptTemplateId: string;
  contextPackageHash: string;
  latencyMsByModel: Record<string, number>;
  tokenUsageByModel: Record<string, { input: number; output: number }>;
  estimatedCostUsdByModel: Record<string, number>;
  findings: ReviewFindingRecord[];
}

export interface RepoMemoryFact {
  id: string;
  summary: string;
  tags: string[];
  source: "maintainer" | "postmortem" | "review-analytics";
  updatedAtIso: string;
}
