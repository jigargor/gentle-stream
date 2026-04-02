import type { Article, LayoutVariant } from "@gentle-stream/domain/types";

export interface NewspaperLayoutPlan {
  templateId:
    | "single-hero"
    | "two-columns"
    | "hero-left"
    | "middle-wide"
    | "hero-sidebar";
  layouts: LayoutVariant[];
  orderedIndices: number[];
  columnHeightsPx: number[];
  inlineGapPx: number;
  inlineTargetColumn: number | null;
  inlineSuggestedModuleType: "generated_art" | "todo";
  residualGapPx: number;
}

interface CandidateTemplate {
  templateId: "hero-left" | "middle-wide" | "hero-sidebar";
  layouts: LayoutVariant[];
  // Group article indices by visual column so we can estimate imbalance.
  columns: number[][];
}

const CANDIDATES: CandidateTemplate[] = [
  {
    templateId: "hero-left",
    layouts: ["hero", "standard", "standard"],
    columns: [[0], [1], [2]],
  },
  {
    templateId: "middle-wide",
    layouts: ["standard", "wide", "standard"],
    columns: [[0], [1], [2]],
  },
  {
    templateId: "hero-sidebar",
    layouts: ["hero", "standard", "standard"],
    columns: [[0], [1, 2]],
  },
];

const PERMUTATIONS_3: number[][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function scoreTextLength(article: Article): number {
  const headline = article.headline?.length ?? 0;
  const subheadline = article.subheadline?.length ?? 0;
  const body = article.body?.length ?? 0;
  const hasQuote = article.pullQuote?.trim() ? 220 : 0;
  const isRecipe =
    "contentKind" in article && article.contentKind === "recipe";
  const recipeBoost = isRecipe ? 900 : 0;
  const imageBoost =
    "recipeImages" in article && (article.recipeImages?.length ?? 0) > 0
      ? 400
      : article.imagePrompt?.trim()
        ? 300
        : 0;
  const base = headline * 2.2 + subheadline * 1.6 + body * 0.35;
  return base + hasQuote + recipeBoost + imageBoost;
}

function layoutWeight(layout: LayoutVariant): number {
  if (layout === "hero") return 1.35;
  if (layout === "wide") return 1.12;
  return 1;
}

function estimateColumnImbalance(
  articles: Article[],
  candidate: CandidateTemplate,
  orderedIndices: number[]
): { imbalance: number; columnScores: number[] } {
  const ordered = orderedIndices.map((idx) => articles[idx]!);
  const perIndex = ordered.map((a, i) =>
    scoreTextLength(a) * layoutWeight(candidate.layouts[i] ?? "standard")
  );
  const columnScores = candidate.columns.map((indices) =>
    indices.reduce((sum, idx) => sum + (perIndex[idx] ?? 0), 0)
  );
  const max = Math.max(...columnScores);
  const min = Math.min(...columnScores);
  return { imbalance: Math.max(0, max - min), columnScores };
}

function imbalanceToResidualPx(imbalanceUnits: number): number {
  // Calibrated heuristic; keeps behavior stable across varying article lengths.
  return Math.round(Math.min(520, imbalanceUnits / 13));
}

export function chooseNewspaperLayout(
  articles: Article[],
  sectionIndex: number
): NewspaperLayoutPlan {
  if (articles.length <= 1) {
    return {
      templateId: "single-hero",
      layouts: ["hero"],
      orderedIndices: [0],
      columnHeightsPx: [0],
      inlineGapPx: 0,
      inlineTargetColumn: null,
      inlineSuggestedModuleType: "generated_art",
      residualGapPx: 0,
    };
  }
  if (articles.length === 2) {
    const left = scoreTextLength(articles[0]!);
    const right = scoreTextLength(articles[1]!);
    const imbalance = Math.abs(left - right);
    const target = left <= right ? 0 : 1;
    return {
      templateId: "two-columns",
      layouts: ["standard", "standard"],
      orderedIndices: [0, 1],
      columnHeightsPx: [left, right],
      inlineGapPx: imbalanceToResidualPx(imbalance),
      inlineTargetColumn: target,
      inlineSuggestedModuleType: "generated_art",
      residualGapPx: 0,
    };
  }

  // For 3-article sections we pick the best template + deterministic article order.
  let best = CANDIDATES[sectionIndex % CANDIDATES.length]!;
  let bestOrder = PERMUTATIONS_3[0]!;
  let bestImbalance = Number.POSITIVE_INFINITY;
  let bestColumns: number[] = [];

  for (const candidate of CANDIDATES) {
    for (const permutation of PERMUTATIONS_3) {
      const { imbalance, columnScores } = estimateColumnImbalance(
        articles,
        candidate,
        permutation
      );
      if (imbalance < bestImbalance) {
        best = candidate;
        bestOrder = permutation;
        bestImbalance = imbalance;
        bestColumns = columnScores;
      }
    }
  }
  const minHeight = Math.min(...bestColumns);
  const maxHeight = Math.max(...bestColumns);
  const inlineGapPx = imbalanceToResidualPx(Math.max(0, maxHeight - minHeight));
  const inlineTargetColumn = bestColumns.findIndex((height) => height === minHeight);
  const hasRecipe = bestOrder.some((idx) => {
    const article = articles[idx];
    return (
      article &&
      "contentKind" in article &&
      article.contentKind === "recipe"
    );
  });
  const inlineSuggestedModuleType = hasRecipe ? "todo" : "generated_art";

  return {
    templateId: best.templateId,
    layouts: best.layouts,
    orderedIndices: bestOrder,
    columnHeightsPx: bestColumns,
    inlineGapPx,
    inlineTargetColumn: inlineTargetColumn >= 0 ? inlineTargetColumn : null,
    inlineSuggestedModuleType,
    residualGapPx: imbalanceToResidualPx(bestImbalance),
  };
}
