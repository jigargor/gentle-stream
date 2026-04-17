/**
 * Test: End-to-end recommendation behavior with engagement affinity
 *
 * Writes fixture rows, refreshes affinity, runs getRankedFeed before/after affinity,
 * and asserts top-N ordering shifts toward engaged category.
 *
 * Run:
 *   npx tsx -r dotenv/config scripts/test-recommendation-e2e.ts dotenv_config_path=.env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

let insertArticles: typeof import("../lib/db/articles").insertArticles;
let db: typeof import("../lib/db/client").db;
let getRankedFeed: typeof import("../lib/agents/rankerAgent").getRankedFeed;

async function initDeps() {
  const [articlesMod, clientMod, rankerMod] = await Promise.all([
    import("../lib/db/articles"),
    import("../lib/db/client"),
    import("../lib/agents/rankerAgent"),
  ]);
  insertArticles = articlesMod.insertArticles;
  db = clientMod.db;
  getRankedFeed = rankerMod.getRankedFeed;
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
const TEST_HEADLINE_PREFIX = "TEST_RECO_E2E";

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
      `headline.ilike.%${TEST_HEADLINE_PREFIX}%,headline.ilike.%TEST%RECO%E2E%`
    )
    .lt("fetched_at", staleBeforeIso);
  if (articleErr) throw new Error(`purgeStaleFixtures(articles): ${articleErr.message}`);
}

async function seedArticles() {
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
  };

  const inserted = await insertArticles([
    {
      ...base,
      headline: `TEST_RECO_E2E SCI TOP ${Date.now()}`,
      category: "Science & Discovery",
      /** Engagement will be recorded on this row; boost must overcome Education below. */
      qualityScore: 0.72,
    },
    {
      ...base,
      headline: `TEST_RECO_E2E EDU TOP ${Date.now()}`,
      category: "Education",
      /** Higher base quality than Science before affinity; loses after Science affinity boost. */
      qualityScore: 0.85,
    },
    {
      ...base,
      headline: `TEST_RECO_E2E SCI SECOND ${Date.now()}`,
      category: "Science & Discovery",
      qualityScore: 0.65,
    },
  ]);
  insertedIds.push(...inserted.map((a) => a.id));
  assert(inserted.length === 3, "Inserted 3 fixture articles");

  // insertArticles sets tagged=false (ingest default). Ranker only considers tagged rows.
  const { error: tagErr } = await db
    .from("articles")
    .update({ tagged: true })
    .in("id", insertedIds);
  assert(!tagErr, "Tagged fixture articles for feed pool", tagErr?.message);
}

async function testBeforeAfterAffinityOrdering() {
  console.log("\n── Before/after affinity ordering ─────────────────────────────");

  const before = await getRankedFeed({
    userId: testUserId,
    sectionIndex: 0,
    pageSize: 3,
    markSeen: false,
  });

  assert(before.articles.length > 0, "Baseline feed returns at least one article");
  const beforeTopCategory = before.articles[0]?.category ?? "";

  // Prefer our seeded Science fixture so affinity is tied to known rows; fallback to feed.
  const targetId =
    insertedIds[0] ??
    before.articles.find((a) => a.category === "Science & Discovery")?.id ??
    "";
  if (!targetId) {
    assert(false, "No science article available for engagement seed");
    return;
  }

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

  // Same sectionIndex as baseline: mixed-feed category order is derived from sectionIndex;
  // changing it swaps the primary category and replaces the whole candidate pool, so
  // before/after top-{category} would compare unrelated slices (flaky in CI).
  const after = await getRankedFeed({
    userId: testUserId,
    sectionIndex: 0,
    pageSize: 3,
    markSeen: false,
  });
  assert(after.articles.length > 0, "Post-affinity feed returns articles");
  const afterTopCategory = after.articles[0]?.category ?? "";

  assert(
    afterTopCategory === "Science & Discovery",
    "Top recommendation shifts to engaged category",
    `Before top: ${beforeTopCategory}, After top: ${afterTopCategory}`
  );
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

