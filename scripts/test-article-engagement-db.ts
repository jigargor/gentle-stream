/**
 * Test: Engagement DB integrity + affinity refresh behavior
 *
 * Requires Supabase env vars.
 *
 * Run:
 *   npx tsx -r dotenv/config scripts/test-article-engagement-db.ts dotenv_config_path=.env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

let db: typeof import("../lib/db/client").db;
let insertArticles: typeof import("../lib/db/articles").insertArticles;

async function initDeps() {
  const [articlesMod, clientMod] = await Promise.all([
    import("../lib/db/articles"),
    import("../lib/db/client"),
  ]);
  insertArticles = articlesMod.insertArticles;
  db = clientMod.db;
}

let passed = 0;
let failed = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Match editorial categories across minor string differences (whitespace, ampersand forms). */
function normalizeCategoryForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\uFF06/g, "&") // fullwidth ampersand (rare DB / copy-paste)
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
}

function findAffinityRow(
  rows: { category: string; affinity_score?: number | null; interactions?: number | null }[],
  categoryLabel: string
) {
  const want = normalizeCategoryForMatch(categoryLabel);
  return rows.find((r) => normalizeCategoryForMatch(r.category ?? "") === want);
}

/** Follow-up reads can hit a lagging replica right after `refresh_user_article_affinity`. */
async function readAffinityRowsAfterRefresh(
  userId: string,
  expectAtLeast: number,
  maxWaitMs = process.env.CI ? 20_000 : 8_000
): Promise<{ category: string; affinity_score: number | null; interactions: number | null }[]> {
  const deadline = Date.now() + maxWaitMs;
  let last: { category: string; affinity_score: number | null; interactions: number | null }[] = [];
  while (Date.now() < deadline) {
    const { data, error: affErr } = await db
      .from("user_article_affinity")
      .select("category, affinity_score, interactions")
      .eq("user_id", userId);
    if (affErr) throw new Error(affErr.message);
    last = data ?? [];
    if (last.length >= expectAtLeast) return last;
    await sleep(250);
  }
  return last;
}

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

const testUserId = `eng-test-user-${Date.now()}`;
const insertedArticleIds: string[] = [];
const TEST_HEADLINE_PREFIX = "TEST_ENG_DB";

/**
 * Only delete fixture rows older than this window so parallel CI jobs do not
 * remove another run's articles (CASCADE wipes engagement events → empty affinity).
 */
const STALE_FIXTURE_MAX_AGE_MS = 30 * 60 * 1000;

async function purgeStaleFixtures() {
  const staleBeforeIso = new Date(
    Date.now() - STALE_FIXTURE_MAX_AGE_MS
  ).toISOString();

  const { error: evtErr } = await db
    .from("article_engagement_events")
    .delete()
    .like("user_id", "eng-test-user-%")
    .lt("occurred_at", staleBeforeIso);
  if (evtErr) throw new Error(`purgeStaleFixtures(events): ${evtErr.message}`);

  const { error: affinityErr } = await db
    .from("user_article_affinity")
    .delete()
    .like("user_id", "eng-test-user-%")
    .lt("updated_at", staleBeforeIso);
  if (affinityErr)
    throw new Error(`purgeStaleFixtures(affinity): ${affinityErr.message}`);

  const { error: articleErr } = await db
    .from("articles")
    .delete()
    .or(`headline.ilike.%${TEST_HEADLINE_PREFIX}%,headline.ilike.%TEST%ENG%DB%`)
    .lt("fetched_at", staleBeforeIso);
  if (articleErr) throw new Error(`purgeStaleFixtures(articles): ${articleErr.message}`);
}

async function testSchemaPresence() {
  console.log("\n── Schema checks ───────────────────────────────────────────────");
  const { data: tableRows, error: tableErr } = await db
    .from("article_engagement_events")
    .select("id")
    .limit(1);
  assert(!tableErr, "article_engagement_events table query succeeds", tableErr?.message);
  assert(Array.isArray(tableRows), "article_engagement_events query returns rows");

  const { data: affinityRows, error: affErr } = await db
    .from("user_article_affinity")
    .select("user_id")
    .limit(1);
  assert(!affErr, "user_article_affinity table query succeeds", affErr?.message);
  assert(Array.isArray(affinityRows), "user_article_affinity query returns rows");
}

async function seedArticles() {
  const base = {
    subheadline: "sub",
    byline: "By Test",
    location: "Global",
    body: "P1\n\nP2\n\nP3",
    pullQuote: "quote",
    imagePrompt: "img",
    sourceUrls: [] as string[],
    tags: [],
    sentiment: "uplifting" as const,
    emotions: [],
    readingTimeSecs: 60,
    qualityScore: 0.5,
  };

  const inserted = await insertArticles([
    {
      ...base,
      headline: `TEST_ENG_DB Science Alpha ${Date.now()}`,
      category: "Science & Discovery",
      locale: "global",
    },
    {
      ...base,
      headline: `TEST_ENG_DB Education Beta ${Date.now()}`,
      category: "Education",
      locale: "global",
    },
  ]);

  insertedArticleIds.push(...inserted.map((a) => a.id));
  assert(inserted.length === 2, "Inserted 2 seed articles for engagement tests");
}

async function testAffinityWeightingAndDecay() {
  console.log("\n── Affinity weighting + decay checks ──────────────────────────");
  const [scienceId, educationId] = insertedArticleIds;
  if (!scienceId || !educationId) {
    assert(false, "Seed articles missing");
    return;
  }

  const now = Date.now();
  const recent = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
  // Well outside the RPC's 30d window; avoid ~45d if client/server clocks differ materially.
  const oldOutsideWindow = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertEvtErr } = await db.from("article_engagement_events").insert([
    {
      user_id: testUserId,
      article_id: scienceId,
      event_type: "save",
      occurred_at: recent,
      context: { source: "feed" },
    },
    {
      user_id: testUserId,
      article_id: educationId,
      event_type: "impression",
      occurred_at: recent,
      context: { source: "feed" },
    },
    {
      user_id: testUserId,
      article_id: educationId,
      event_type: "save",
      occurred_at: oldOutsideWindow,
      context: { source: "feed" },
    },
  ]);
  assert(!insertEvtErr, "Inserted engagement events", insertEvtErr?.message);

  const { count: evtCount, error: evtCountErr } = await db
    .from("article_engagement_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", testUserId);
  assert(!evtCountErr, "Count engagement events for test user", evtCountErr?.message);
  assert(
    evtCount === 3,
    "Three engagement events inserted for test user",
    `count=${evtCount ?? "null"}`
  );

  const { error: rpcErr } = await db.rpc("refresh_user_article_affinity", {
    p_user_id: testUserId,
  });
  assert(!rpcErr, "refresh_user_article_affinity RPC succeeds", rpcErr?.message);

  // Ground-truth categories from `articles` (must match RPC JOIN); avoids literal drift vs DB.
  const { data: articleCats, error: artCatErr } = await db
    .from("articles")
    .select("id, category, deleted_at")
    .in("id", [scienceId, educationId]);
  assert(!artCatErr, "Load categories for seed articles", artCatErr?.message);
  const scienceArticle = articleCats?.find((r) => String(r.id) === String(scienceId));
  const educationArticle = articleCats?.find((r) => String(r.id) === String(educationId));
  assert(Boolean(scienceArticle?.category), "Science seed article has category");
  assert(Boolean(educationArticle?.category), "Education seed article has category");
  assert(
    scienceArticle?.deleted_at == null && educationArticle?.deleted_at == null,
    "Seed articles not soft-deleted (refresh RPC filters deleted_at)",
    JSON.stringify({ scienceArticle, educationArticle })
  );

  const rows = await readAffinityRowsAfterRefresh(testUserId, 2);
  assert(
    rows.length >= 2,
    "User affinity has at least two category rows after refresh",
    rows.length === 0 ? "no rows (check replica lag / RPC / articles.deleted_at)" : JSON.stringify(rows)
  );

  const scienceCat = scienceArticle?.category as string;
  const educationCat = educationArticle?.category as string;

  const science = findAffinityRow(rows, scienceCat);
  const education = findAffinityRow(rows, educationCat);
  assert(Boolean(science), "Science affinity row exists", JSON.stringify(rows));
  assert(Boolean(education), "Education affinity row exists", JSON.stringify(rows));
  assert(
    (science?.affinity_score ?? 0) > (education?.affinity_score ?? 0),
    "Save-weighted science score outranks impression-only education score",
    `science=${science?.affinity_score} education=${education?.affinity_score}`
  );
  assert(
    (education?.interactions ?? 0) === 1,
    "Events older than 30d excluded from interactions",
    `education.interactions=${education?.interactions} (expected only recent impression + in-window events)`
  );
}

async function cleanup() {
  await db.from("article_engagement_events").delete().eq("user_id", testUserId);
  await db.from("user_article_affinity").delete().eq("user_id", testUserId);
  if (insertedArticleIds.length > 0) {
    await db.from("articles").delete().in("id", insertedArticleIds);
  }
}

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Engagement DB Tests");
  console.log("══════════════════════════════════════════════");

  try {
    await initDeps();
    await purgeStaleFixtures();
    await testSchemaPresence();
    await seedArticles();
    await testAffinityWeightingAndDecay();
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

