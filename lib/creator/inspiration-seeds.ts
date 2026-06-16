const DEFAULT_INSPIRATION_SEEDS = [
  "dramatic",
  "intellectual",
  "stern",
  "cold",
  "curious",
  "playful",
] as const;

const ARTICLE_TYPE_TONE_HINTS: Record<string, string[]> = {
  recipe: ["warm", "inviting", "sensory"],
  opinion: ["direct", "confident", "reflective"],
  profile: ["intimate", "observant", "human"],
  explainer: ["clear", "curious", "grounded"],
  news: ["concise", "factual", "measured"],
  essay: ["lyrical", "thoughtful", "personal"],
};

function wordsFromHeadline(headline: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "for",
    "to",
    "in",
    "on",
    "of",
    "with",
    "how",
    "why",
    "what",
  ]);
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !stop.has(word))
    .slice(0, 3);
}

export interface InspirationSeedInput {
  articleType?: string;
  articleTypeCustom?: string;
  headline?: string;
  context?: string;
}

/** Context-aware tone hints for creator assist inspiration mode. */
export function buildInspirationContextSeeds(input: InspirationSeedInput): string[] {
  const seeds = new Set<string>();
  const rawType = (input.articleTypeCustom ?? input.articleType ?? "").trim().toLowerCase();

  for (const [key, hints] of Object.entries(ARTICLE_TYPE_TONE_HINTS)) {
    if (rawType.includes(key)) {
      for (const hint of hints) seeds.add(hint);
    }
  }

  for (const word of wordsFromHeadline(input.headline ?? "")) {
    seeds.add(word);
  }

  const context = input.context?.trim();
  if (context) {
    for (const word of wordsFromHeadline(context)) {
      seeds.add(word);
    }
  }

  for (const fallback of DEFAULT_INSPIRATION_SEEDS) {
    if (seeds.size >= 6) break;
    seeds.add(fallback);
  }

  return [...seeds].slice(0, 6);
}
