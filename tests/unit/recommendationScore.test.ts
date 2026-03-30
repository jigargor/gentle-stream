import { describe, expect, it } from "vitest";
import { FEED_GAME_TYPES } from "@/lib/games/feedPick";
import { scoreArticleWithEngagement } from "@/lib/feed/recommendationScore";
import type { StoredArticle, UserProfile } from "@/lib/types";

function makeProfile(): UserProfile {
  return {
    userId: "u1",
    categoryWeights: {
      "Science & Discovery": 0.125,
      "Community Heroes": 0.125,
      "Arts & Culture": 0.125,
      "Environment & Nature": 0.125,
      "Health & Wellness": 0.125,
      "Innovation & Tech": 0.125,
      "Human Kindness": 0.125,
      Education: 0.125,
    },
    gameRatio: 0.2,
    enabledGameTypes: ["connections", ...FEED_GAME_TYPES],
    userRole: "general",
    displayName: null,
    username: null,
    usernameSetAt: null,
    avatarUrl: null,
    seenArticleIds: [],
    preferredEmotions: [],
    preferredLocales: ["global"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeArticle(
  category: StoredArticle["category"],
  overrides?: Partial<StoredArticle>
): StoredArticle {
  return {
    id: `${category}-${Math.random().toString(36).slice(2)}`,
    headline: `${category} headline`,
    subheadline: "sub",
    byline: "By Test",
    location: "Global",
    category,
    body: "p1\n\np2\n\np3",
    pullQuote: "quote",
    imagePrompt: "img",
    sourceUrls: [],
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [],
    sentiment: "uplifting",
    emotions: [],
    locale: "global",
    readingTimeSecs: 80,
    qualityScore: 0.9,
    usedCount: 0,
    tagged: true,
    ...overrides,
  };
}

describe("recommendation scoring", () => {
  it("keeps neutral score across categories without affinity", () => {
    const profile = makeProfile();
    const affinity = new Map<string, number>();
    const sci = makeArticle("Science & Discovery");
    const edu = makeArticle("Education");
    const sciScore = scoreArticleWithEngagement(sci, profile, affinity);
    const eduScore = scoreArticleWithEngagement(edu, profile, affinity);
    expect(Math.abs(sciScore - eduScore)).toBeLessThan(0.0001);
  });

  it("raises score for high-affinity category", () => {
    const profile = makeProfile();
    const affinity = new Map<string, number>([
      ["Science & Discovery|global", 12],
      ["Education|global", 0.2],
    ]);
    const sci = makeArticle("Science & Discovery");
    const edu = makeArticle("Education");
    expect(scoreArticleWithEngagement(sci, profile, affinity)).toBeGreaterThan(
      scoreArticleWithEngagement(edu, profile, affinity)
    );
  });

  it("still penalizes stale and overused articles", () => {
    const profile = makeProfile();
    const affinity = new Map<string, number>([["Science & Discovery|global", 20]]);
    const fresh = makeArticle("Science & Discovery", {
      fetchedAt: new Date().toISOString(),
      usedCount: 0,
    });
    const staleOverused = makeArticle("Science & Discovery", {
      fetchedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      usedCount: 120,
    });
    expect(scoreArticleWithEngagement(fresh, profile, affinity)).toBeGreaterThan(
      scoreArticleWithEngagement(staleOverused, profile, affinity)
    );
  });
});
