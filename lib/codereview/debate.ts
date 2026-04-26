import type {
  ReviewCategory,
  ReviewFindingRecord,
  ReviewModelRef,
  ReviewMode,
} from "./types";

const CATEGORY_PRIORITY: Record<ReviewCategory, number> = {
  security: 0,
  correctness: 1,
  data_loss: 2,
  performance: 3,
  reliability: 4,
  style: 5,
};

export function chooseReviewMode(isChallengerValidationEnabled: boolean): ReviewMode {
  return isChallengerValidationEnabled ? "challenger_validation" : "standard";
}

export function deterministicReviewerOrder(
  reviewers: ReviewModelRef[],
  seed: string
): ReviewModelRef[] {
  return [...reviewers].sort((left, right) => {
    const leftKey = `${seed}:${left.provider}:${left.model}`;
    const rightKey = `${seed}:${right.provider}:${right.model}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function rankFindingsForTieBreak(
  findings: ReviewFindingRecord[]
): ReviewFindingRecord[] {
  return [...findings].sort((left, right) => {
    const categoryDiff =
      CATEGORY_PRIORITY[left.category] - CATEGORY_PRIORITY[right.category];
    if (categoryDiff !== 0) return categoryDiff;
    if (left.significance !== right.significance) {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[left.significance] - order[right.significance];
    }
    return left.findingId.localeCompare(right.findingId);
  });
}
