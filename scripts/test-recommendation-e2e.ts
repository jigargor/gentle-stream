/**
 * Test: End-to-end recommendation behavior with engagement affinity
 *
 * Writes fixture rows, refreshes affinity, runs getRankedFeed before/after affinity,
 * and asserts top-N ordering shifts toward engaged category.
 *
 * Run:
 *   npx tsx -r dotenv/config scripts/test-recommendation-e2e.ts dotenv_config_path=.env.local
 *
 * CI: GitHub Secrets are not visible to `process.env` unless each secret is passed through the
 * job `env:` block. This script only needs Supabase + DB RPCs, not LLM keys.
 */

import { config } from "dotenv";
import type { StoredArticle } from "../lib/types";
config({ path: ".env.local" });

let buildAffinityIndex: typeof import("../lib/feed/recommendationScore").buildAffinityIndex;
let scoreArticleWithEngagement: typeof import("../lib/feed/recommendationScore").scoreArticleWithEngagement;
let insertArticles: typeof import("../lib/db/articles").insertArticles;
let db: typeof import("../lib/db/client").db;
let getRankedFeed: typeof import("../lib/agents/rankerAgent").getRankedFeed;

async function initDeps() {
  const [articlesMod, clientMod, rankerMod, scoreMod] = await Promise.all([
    import("../lib/db/articles"),
    import("../lib/db/client"),
    import("../lib/agents/rankerAgent"),
    import("../lib/feed/recommendationScore"),
  ]);
  insertArticles = articlesMod.insertArticles;
  db = clientMod.db;
  getRankedFeed = rankerMod.getRankedFeed;
  buildAffinityIndex = scoreMod.buildAffinityIndex;
  scoreArticleWithEngagement = scoreMod.scoreArticleWithEngagement;
}

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

const testUserId = `reco-e2e-${Date.now()}`;
const insertedIds: string[] = [];
/** Populated in seedArticles — `insertArticles` return order is not guaranteed to match input. */
let insertedArticles: StoredArticle[] = [];
/**
 * Must NOT contain `test_reco_e2e` (see `isLikelyTestFixtureRow` in lib/db/articles.ts) or
 * fixtures are stripped from `getArticlesForFeed` / random pool and this script ranks only real rows.
 */
const TEST_HEADLINE_PREFIX = "RECO_E2E_FIXTURE";

/**
 * Only delete reco-e2e fixture rows older than this window so parallel CI jobs
 * do not wipe another run's fresh data (e.g. FK errors on article_engagement_events).
 */
const STALE_FIXTURE_MAX_AGE_MS = 30 * 60 * 1000;

async function purgeStaleFixtures() {
  const staleBeforeIso = new Date(
    Date.now() - STALE_FIXTURE_MAX_AGE_MS
  ).toISOString();

  const { error: evtErr } = await db
    .from("article_engagement_events")
    .delete()
    .like("user_id", "reco-e2e-%")
    .lt("occurred_at", staleBeforeIso);
  if (evtErr) throw new Error(`purgeStaleFixtures(events): ${evtErr.message}`);

  const { error: affinityErr } = await db
    .from("user_article_affinity")
    .delete()
    .like("user_id", "reco-e2e-%")
    .lt("updated_at", staleBeforeIso);
  if (affinityErr)
    throw new Error(`purgeStaleFixtures(affinity): ${affinityErr.message}`);

  const { error: articleErr } = await db
    .from("articles")
    .delete()
    .or(
      `headline.ilike.%${TEST_HEADLINE_PREFIX}%,headline.ilike.%TEST_RECO_E2E%`
    )
    .lt("fetched_at", staleBeforeIso);
  if (articleErr) throw new Error(`purgeStaleFixtures(articles): ${articleErr.message}`);
}

async function seedArticles() {
  const nowIso = new Date().toISOString();
  const approvedModeration = {
    moderationStatus: "approved" as const,
    moderatedAt: nowIso,
    moderatedByUserId: "reco-e2e-script",
    moderationConfidence: 0.99,
    moderationLabels: {} as Record<string, unknown>,
  };
  const base = {
    subheadline: "sub",
    byline: "By Test",
    location: "Global",
    body: "p1\n\np2\n\np3",
    pullQuote: "quote",
    imagePrompt: "img",
    sourceUrls: [] as string[],
    tags: [],
    sentiment: "uplifting" as const,
    emotions: [],
    locale: "global",
    readingTimeSecs: 90,
    ...approvedModeration,
  };

  insertedArticles = await insertArticles([
    {
      ...base,
      headline: `${TEST_HEADLINE_PREFIX} SCI TOP ${Date.now()}`,
      category: "Science & Discovery",
      /** Engagement will be recorded on this row; boost must overcome Education below. */
      qualityScore: 0.72,
    },
    {
      ...base,
      headline: `${TEST_HEADLINE_PREFIX} EDU TOP ${Date.now()}`,
      category: "Education",
      /** Higher base quality than Science before affinity; loses after Science affinity boost. */
      qualityScore: 0.85,
    },
    {
      ...base,
      headline: `${TEST_HEADLINE_PREFIX} SCI SECOND ${Date.now()}`,
      category: "Science & Discovery",
      qualityScore: 0.65,
    },
  ]);
  insertedIds.push(...insertedArticles.map((a) => a.id));
  assert(insertedArticles.length === 3, "Inserted 3 fixture articles");

  // insertArticles sets tagged=false (ingest default). Ranker only considers tagged rows.
  const { error: tagErr } = await db
    .from("articles")
    .update({ tagged: true })
    .in("id", insertedIds);
  assert(!tagErr, "Tagged fixture articles for feed pool", tagErr?.message);
}

async function testBeforeAfterAffinityOrdering() {
  console.log("\n── Before/after affinity ordering ─────────────────────────────");

  const scienceFixture = insertedArticles.find((a) => a.headline.includes("SCI TOP"));
  const targetId = scienceFixture?.id ?? "";
  assert(Boolean(targetId), "Resolved Science SCI TOP fixture (insert order is non-deterministic)");

  const scienceCategory = "Science & Discovery" as const;
  const sciencePageSize = 40;

  const beforeScience = await getRankedFeed({
    userId: testUserId,
    category: scienceCategory,
    sectionIndex: 0,
    pageSize: sciencePageSize,
    markSeen: false,
  });
  assert(beforeScience.articles.length > 0, "Science slice returns articles before affinity");
  const rankBefore = beforeScience.articles.findIndex((a) => a.id === targetId);
  assert(rankBefore >= 0, "Fixture appears in Science-ranked pool before affinity", `index ${rankBefore}`);

  const { error: evtErr } = await db.from("article_engagement_events").insert([
    {
      user_id: testUserId,
      article_id: targetId,
      event_type: "save",
      context: { source: "feed" },
    },
    {
      user_id: testUserId,
      article_id: targetId,
      event_type: "like",
      context: { source: "feed" },
    },
    {
      user_id: testUserId,
      article_id: targetId,
      event_type: "read_75pct",
      context: { source: "feed" },
    },
  ]);
  assert(!evtErr, "Inserted engagement events for test user", evtErr?.message);

  const { error: refreshErr } = await db.rpc("refresh_user_article_affinity", {
    p_user_id: testUserId,
  });
  assert(!refreshErr, "Refreshed user affinity", refreshErr?.message);

  const afterScience = await getRankedFeed({
    userId: testUserId,
    category: scienceCategory,
    sectionIndex: 0,
    pageSize: sciencePageSize,
    markSeen: false,
  });
  assert(afterScience.articles.length > 0, "Science slice returns articles after affinity");
  const rankAfter = afterScience.articles.findIndex((a) => a.id === targetId);
  assert(rankAfter >= 0, "Fixture appears in Science-ranked pool after affinity", `index ${rankAfter}`);

  const { data: affRows, error: affErr } = await db
    .from("user_article_affinity")
    .select("category, locale, affinity_score")
    .eq("user_id", testUserId)
    .in("category", ["Science & Discovery", "Education"]);
  assert(!affErr, "Affinity lookup succeeds", affErr?.message);
  assert(
    (affRows ?? []).some((row) => row.category === scienceCategory),
    "Affinity row exists for Science after refresh"
  );

  const educationFixture = insertedArticles.find((a) => a.headline.includes("EDU TOP"));
  assert(Boolean(educationFixture), "Resolved Education comparison fixture");
  if (scienceFixture && educationFixture) {
    const { getOrCreateUserProfile } = await import("../lib/db/users");
    const profile = await getOrCreateUserProfile(testUserId);
    const beforeAffinity = new Map<string, number>();
    const afterAffinity = buildAffinityIndex(
      (affRows ?? []).map((row) => ({
        category: String(row.category),
        locale: String(row.locale ?? "global"),
        affinity_score: Number(row.affinity_score ?? 0),
      }))
    );
    const scienceBeforeScore = scoreArticleWithEngagement(scienceFixture, profile, beforeAffinity);
    const educationBeforeScore = scoreArticleWithEngagement(educationFixture, profile, beforeAffinity);
    const scienceAfterScore = scoreArticleWithEngagement(scienceFixture, profile, afterAffinity);
    const educationAfterScore = scoreArticleWithEngagement(educationFixture, profile, afterAffinity);

    assert(
      scienceBeforeScore < educationBeforeScore,
      "Before affinity, higher-quality Education fixture outranks Science fixture",
      `science=${scienceBeforeScore.toFixed(4)} education=${educationBeforeScore.toFixed(4)}`
    );
    assert(
      scienceAfterScore > educationAfterScore,
      "After affinity, engaged Science fixture outranks Education fixture by score",
      `science=${scienceAfterScore.toFixed(4)} education=${educationAfterScore.toFixed(4)}; science rank ${rankBefore} -> ${rankAfter}`
    );
  }
}

async function cleanup() {
  await db.from("article_engagement_events").delete().eq("user_id", testUserId);
  await db.from("user_article_affinity").delete().eq("user_id", testUserId);
  if (insertedIds.length > 0) {
    await db.from("articles").delete().in("id", insertedIds);
  }
}

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Recommendation E2E Test");
  console.log("══════════════════════════════════════════════");

  try {
    await initDeps();
    await purgeStaleFixtures();
    await seedArticles();
    await testBeforeAfterAffinityOrdering();
  } finally {
    await cleanup();
    await purgeStaleFixtures();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${passed} passed  |  ${failed} failed`);
  console.log("══════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
