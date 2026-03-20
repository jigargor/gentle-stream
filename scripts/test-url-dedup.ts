/**
 * Test: URL-based deduplication
 *
 * Verifies that:
 *   1. normaliseUrl strips scheme, www, query params, trailing slashes
 *   2. insertArticles blocks an article whose source URLs overlap with
 *      a stored article — even when the headline is completely different
 *   3. Articles with no overlapping URLs are not affected
 *
 * Zero Claude API calls. Writes real rows then cleans up.
 *
 * Run from project root:
 *   npx tsx scripts/test-url-dedup.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { insertArticles, normaliseUrl } from "../lib/db/articles";
import { db } from "../lib/db/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const insertedIds: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     Got: ${detail}`);
    failed++;
  }
}

const BASE = {
  subheadline: "sub", byline: "By Test", location: "Global",
  category: "Education" as const,
  body: "Para one.\n\nPara two.\n\nPara three.",
  pullQuote: "quote", imagePrompt: "img",
  tags: [], sentiment: "uplifting" as const, emotions: [],
  locale: "global", readingTimeSecs: 60, qualityScore: 0.5,
};

// ─── Unit tests for normaliseUrl (no DB) ──────────────────────────────────────

function testNormaliseUrl() {
  console.log("\n── normaliseUrl unit tests ────────────────────────────────────");

  const cases: [string, string, string][] = [
    [
      "https://www.bbc.com/news/article-123?source=rss&ref=home",
      "bbc.com/news/article-123",
      "strips https, www, query string",
    ],
    [
      "http://bbc.com/news/article-123/",
      "bbc.com/news/article-123",
      "strips http, trailing slash",
    ],
    [
      "https://BBC.COM/News/Article-123",
      "bbc.com/news/article-123",
      "lowercases host and path",
    ],
    [
      "https://reuters.com/world/story#comments",
      "reuters.com/world/story",
      "strips fragment",
    ],
    [
      "https://www.nature.com/articles/s41586-024-00001-1",
      "nature.com/articles/s41586-024-00001-1",
      "preserves path structure",
    ],
  ];

  for (const [input, expected, label] of cases) {
    const result = normaliseUrl(input);
    assert(result === expected, label, result);
  }
}

// ─── DB integration tests ──────────────────────────────────────────────────────

async function testUrlBlocksSameArticleDifferentTitle() {
  console.log("\n── URL overlap blocks same article with different headline ────");

  const sharedUrl = "https://www.bbc.com/news/science-TEST_URL_DEDUP-123";

  const original = {
    ...BASE,
    headline: "TEST_URL_DEDUP Scientists Make Breakthrough Discovery",
    sourceUrls: [sharedUrl],
  };

  const rephrased = {
    ...BASE,
    headline: "TEST_URL_DEDUP Researchers Achieve Major Scientific Advance", // totally different title
    sourceUrls: [sharedUrl], // same underlying article
  };

  const first = await insertArticles([original]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Original article inserted");

  const second = await insertArticles([rephrased]);
  assert(
    second.length === 0,
    "Rephrased article blocked — same URL already stored"
  );
}

async function testUrlVariantsNormalisedCorrectly() {
  console.log("\n── URL variants normalise to same key ─────────────────────────");

  const canonical = "https://www.nature.com/articles/TEST_URL_DEDUP_s41586";

  const original = {
    ...BASE,
    headline: "TEST_URL_DEDUP Nature Study On Coral Reefs Alpha",
    sourceUrls: [canonical],
  };

  // Same URL but with tracking params and different scheme
  const withTracking = {
    ...BASE,
    headline: "TEST_URL_DEDUP Nature Study On Coral Reefs Beta", // different title
    sourceUrls: ["http://nature.com/articles/TEST_URL_DEDUP_s41586?utm_source=twitter"],
  };

  const first = await insertArticles([original]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Original inserted");

  const second = await insertArticles([withTracking]);
  assert(second.length === 0, "Tracking-param variant blocked — normalises to same URL");
}

async function testDifferentUrlsNotBlocked() {
  console.log("\n── Different source URLs are not blocked ──────────────────────");

  const articleA = {
    ...BASE,
    headline: "TEST_URL_DEDUP Unrelated Article Alpha",
    sourceUrls: ["https://bbc.com/news/TEST_URL_DEDUP_article_alpha"],
  };

  const articleB = {
    ...BASE,
    headline: "TEST_URL_DEDUP Unrelated Article Beta",
    sourceUrls: ["https://reuters.com/world/TEST_URL_DEDUP_article_beta"],
  };

  const first = await insertArticles([articleA]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Article A inserted");

  const second = await insertArticles([articleB]);
  insertedIds.push(...second.map((a) => a.id));
  assert(second.length === 1, "Article B inserted — different URLs, not blocked");
}

async function testPartialUrlOverlap() {
  console.log("\n── Partial URL overlap (one shared source) is blocked ─────────");

  const sharedUrl = "https://sciencedaily.com/releases/TEST_URL_DEDUP_shared";

  const original = {
    ...BASE,
    headline: "TEST_URL_DEDUP Partial Overlap Original Article",
    sourceUrls: [
      sharedUrl,
      "https://phys.org/news/TEST_URL_DEDUP_other",
    ],
  };

  const partial = {
    ...BASE,
    headline: "TEST_URL_DEDUP Partial Overlap New Article",
    sourceUrls: [
      sharedUrl,                                         // shared
      "https://newscientist.com/article/TEST_URL_DEDUP_different", // unique
    ],
  };

  const first = await insertArticles([original]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Original inserted");

  const second = await insertArticles([partial]);
  assert(second.length === 0, "Partial overlap (1 shared URL) correctly blocked");
}

async function testNoSourceUrls() {
  console.log("\n── Articles with no source URLs fall back to fingerprint ──────");

  const a = {
    ...BASE,
    headline: "TEST_URL_DEDUP No Source URL Article One",
    sourceUrls: [],
  };

  const b = {
    ...BASE,
    headline: "TEST_URL_DEDUP No Source URL Article One", // exact duplicate
    sourceUrls: [],
  };

  const first = await insertArticles([a]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "First article (no URLs) inserted");

  const second = await insertArticles([b]);
  assert(second.length === 0, "Identical headline with no URLs still blocked by fingerprint");
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (insertedIds.length === 0) return;
  const { error } = await db.from("articles").delete().in("id", insertedIds);
  if (error) {
    console.warn("\n⚠️  Cleanup failed:", error.message);
    console.warn("   Delete manually:", insertedIds);
  } else {
    console.log(`\n🧹 Cleaned up ${insertedIds.length} test row(s)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  URL Deduplication Tests");
  console.log("══════════════════════════════════════════════");

  // Unit tests (no DB)
  testNormaliseUrl();

  // Integration tests (real DB, cleaned up after)
  try {
    await testUrlBlocksSameArticleDifferentTitle();
    await testUrlVariantsNormalisedCorrectly();
    await testDifferentUrlsNotBlocked();
    await testPartialUrlOverlap();
    await testNoSourceUrls();
  } finally {
    await cleanup();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${passed} passed  |  ${failed} failed`);
  console.log("══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
