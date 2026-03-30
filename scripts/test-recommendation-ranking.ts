/**
 * Test: Deterministic recommendation ranking fixtures
 *
 * Pure in-process test of scoring behavior.
 */

import { scoreArticleWithEngagement } from "../lib/feed/recommendationScore";
import type { StoredArticle, UserProfile } from "../lib/types";
import { FEED_GAME_TYPES } from "../lib/games/feedPick";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     ${detail}`);
    failed++;
  }
}

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

function testColdStartNeutral() {
  console.log("\n── Cold start neutrality ──────────────────────────────────────");
  const profile = makeProfile();
  const affinity = new Map<string, number>();
  const sci = makeArticle("Science & Discovery");
  const edu = makeArticle("Education");
  const sciScore = scoreArticleWithEngagement(sci, profile, affinity);
  const eduScore = scoreArticleWithEngagement(edu, profile, affinity);
  assert(
    Math.abs(sciScore - eduScore) < 0.0001,
    "Without affinity, equal-quality cross-category scores remain neutral"
  );
}

function testSingleTopicHeavyEngager() {
  console.log("\n── Single-topic heavy engager ─────────────────────────────────");
  const profile = makeProfile();
  const affinity = new Map<string, number>([
    ["Science & Discovery|global", 12],
    ["Education|global", 0.2],
  ]);
  const sci = makeArticle("Science & Discovery");
  const edu = makeArticle("Education");
  const sciScore = scoreArticleWithEngagement(sci, profile, affinity);
  const eduScore = scoreArticleWithEngagement(edu, profile, affinity);
  assert(sciScore > eduScore, "Science score rises with strong science affinity");
}

function testFreshnessStillMatters() {
  console.log("\n── Freshness/novelty guardrails ───────────────────────────────");
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
  const freshScore = scoreArticleWithEngagement(fresh, profile, affinity);
  const staleScore = scoreArticleWithEngagement(staleOverused, profile, affinity);
  assert(
    freshScore > staleScore,
    "Strong affinity does not override severe freshness+novelty penalties"
  );
}

function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Recommendation Ranking Fixture Tests");
  console.log("══════════════════════════════════════════════");

  testColdStartNeutral();
  testSingleTopicHeavyEngager();
  testFreshnessStillMatters();

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${passed} passed  |  ${failed} failed`);
  console.log("══════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

main();

