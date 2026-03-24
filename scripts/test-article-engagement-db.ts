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

import { db } from "../lib/db/client";
import { insertArticles } from "../lib/db/articles";

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

const testUserId = `eng-test-user-${Date.now()}`;
const insertedArticleIds: string[] = [];

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
  const oldOutsideWindow = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();

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

  const { error: rpcErr } = await db.rpc("refresh_user_article_affinity", {
    p_user_id: testUserId,
  });
  assert(!rpcErr, "refresh_user_article_affinity RPC succeeds", rpcErr?.message);

  const { data: affinityRows, error: affErr } = await db
    .from("user_article_affinity")
    .select("category, affinity_score, interactions")
    .eq("user_id", testUserId);

  assert(!affErr, "Read user affinity rows", affErr?.message);
  const rows = affinityRows ?? [];
  const science = rows.find((r) => r.category === "Science & Discovery");
  const education = rows.find((r) => r.category === "Education");
  assert(Boolean(science), "Science affinity row exists");
  assert(Boolean(education), "Education affinity row exists");
  assert(
    (science?.affinity_score ?? 0) > (education?.affinity_score ?? 0),
    "Save-weighted science score outranks impression-only education score"
  );
  assert(
    (education?.interactions ?? 0) === 1,
    "Events older than 30d excluded from interactions"
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
    await testSchemaPresence();
    await seedArticles();
    await testAffinityWeightingAndDecay();
  } finally {
    await cleanup();
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

