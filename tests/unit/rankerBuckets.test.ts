import { describe, expect, it } from "vitest";
import type { StoredArticle, UserProfile } from "@/lib/types";
import { collectAcrossBuckets } from "@/lib/agents/rankerAgent";
import { CATEGORIES } from "@/lib/constants";

function makeProfile(): UserProfile {
  return {
    userId: "u1",
    categoryWeights: CATEGORIES.reduce(
      (acc, category) => ({ ...acc, [category]: category === CATEGORIES[0] ? 1 : 0 }),
      {} as UserProfile["categoryWeights"]
    ),
    gameRatio: 0.2,
    enabledGameTypes: ["sudoku", "word_search", "crossword", "killer_sudoku", "nonogram", "connections"],
    userRole: "general",
    displayName: null,
    username: null,
    usernameSetAt: null,
    avatarUrl: null,
    weatherLocation: null,
    themePreference: null,
    seenArticleIds: [],
    preferredEmotions: [],
    preferredLocales: ["global"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeArticle(id: string, category: StoredArticle["category"]): StoredArticle {
  return {
    id,
    headline: `${id} headline`,
    subheadline: "",
    byline: "By Test",
    location: "global",
    category,
    body: "body",
    pullQuote: "",
    imagePrompt: "",
    sourceUrls: [],
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    tags: [],
    sentiment: "uplifting",
    emotions: [],
    locale: "global",
    readingTimeSecs: 60,
    qualityScore: 0.7,
    usedCount: 0,
    tagged: true,
    contentKind: "news",
  };
}

describe("collectAcrossBuckets", () => {
  it("deduplicates and uses parallel per-bucket fetch limits", async () => {
    const profile = makeProfile();
    const requestedLimits: number[] = [];

    // With contentKinds ["news"], traversal uses all editorial buckets (no recipe bucket).
    const bucketCount = CATEGORIES.length;
    const poolSize = 3;
    const expectedPerBucketLimit = Math.max(
      8,
      Math.ceil(poolSize / bucketCount) + 8
    );

    const output = await collectAcrossBuckets(
      profile,
      "user-1",
      0,
      poolSize,
      [],
      ["news"],
      async (category, limit) => {
        requestedLimits.push(limit);
        // Parallel fetches: key mock results by category, not call order.
        if (category === CATEGORIES[0]) return [makeArticle("a1", CATEGORIES[0])];
        if (category === CATEGORIES[1]) {
          return [
            makeArticle("a1", CATEGORIES[1]),
            makeArticle("a2", CATEGORIES[1]),
            makeArticle("a3", CATEGORIES[1]),
          ];
        }
        return [];
      }
    );

    expect(output.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(requestedLimits).toHaveLength(bucketCount);
    expect(requestedLimits.every((limit) => limit === expectedPerBucketLimit)).toBe(true);
    expect(expectedPerBucketLimit).toBe(9);
  });
});
