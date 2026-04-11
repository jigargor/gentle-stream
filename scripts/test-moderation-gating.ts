/**
 * Test: moderation gating for feed selection queries.
 *
 * Verifies:
 *  - getArticlesForFeed returns only moderation_status='approved' rows
 *  - getRandomAvailableArticles excludes flagged/rejected rows
 *
 * Writes to the real DB then cleans up inserted rows.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import type { Category } from "../lib/constants";

let db: typeof import("../lib/db/client").db;
let getArticlesForFeed: typeof import("../lib/db/articles").getArticlesForFeed;
let getRandomAvailableArticles: typeof import("../lib/db/articles").getRandomAvailableArticles;

let passed = 0;
let failed = 0;
const insertedIds: string[] = [];
let skipped = false;

function isMissingModerationSchemaError(message: string): boolean {
  return (
    message.includes("moderation_status") ||
    message.includes("moderation_reason") ||
    message.includes("moderated_at") ||
    message.includes("moderation_labels")
  );
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random pool query can lag inserts on shared DBs; poll until the row appears or timeout. */
async function assertApprovedInRandomPool(approvedId: string): Promise<void> {
  const deadline = Date.now() + 25_000;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const randomRows = await getRandomAvailableArticles(80, []);
    lastCount = randomRows.length;
    if (randomRows.some((r) => r.id === approvedId)) {
      assert(true, "Random pool includes approved article");
      return;
    }
    await sleep(350);
  }
  assert(false, "Random pool includes approved article", `not in pool after wait (last sample size ${lastCount})`);
}

async function cleanup() {
  if (insertedIds.length === 0) return;
  const { error } = await db.from("articles").delete().in("id", insertedIds);
  if (error) {
    console.warn("Cleanup failed:", error.message);
    console.warn("Manual delete IDs:", insertedIds);
  } else {
    console.log(`\n🧹 Cleaned up ${insertedIds.length} inserted moderation rows`);
  }
}

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Moderation Gating Tests");
  console.log("══════════════════════════════════════════════");

  const [clientMod, articlesMod] = await Promise.all([
    import("../lib/db/client"),
    import("../lib/db/articles"),
  ]);
  db = clientMod.db;
  getArticlesForFeed = articlesMod.getArticlesForFeed;
  getRandomAvailableArticles = articlesMod.getRandomAvailableArticles;

  const category: Category = "Education";
  const nonce = Date.now().toString(36);
  const now = new Date().toISOString();
  const approvedId = crypto.randomUUID();
  const flaggedId = crypto.randomUUID();
  const rejectedId = crypto.randomUUID();

  try {
    const base = {
      subheadline: "Moderation test fixture",
      byline: "By Moderation Test",
      location: "Testland",
      category,
      body: "This is a moderation gating integration test fixture body.",
      pull_quote: "",
      image_prompt: "",
      fetched_at: now,
      expires_at: "2100-01-01T00:00:00.000Z",
      tags: ["test"],
      sentiment: "uplifting",
      emotions: [],
      locale: "global",
      reading_time_secs: 60,
      quality_score: 0.6,
      used_count: 0,
      tagged: true,
      source_urls: [],
      source: "ingest",
      content_kind: "news",
      moderation_confidence: 0.95,
      moderation_labels: {},
      moderated_at: now,
      moderated_by_user_id: "test-moderation-script",
    };

    const { error: insertError } = await db.from("articles").insert([
      {
        id: approvedId,
        ...base,
        headline: `TEST_MODERATION_GATING approved ${nonce}`,
        fingerprint: `test moderation approved ${nonce}|education`,
        moderation_status: "approved",
        moderation_reason: null,
        deleted_at: null,
        deleted_by_user_id: null,
        delete_reason: null,
      },
      {
        id: flaggedId,
        ...base,
        headline: `TEST_MODERATION_GATING flagged ${nonce}`,
        fingerprint: `test moderation flagged ${nonce}|education`,
        moderation_status: "flagged",
        moderation_reason: "Potential politics",
        deleted_at: null,
        deleted_by_user_id: null,
        delete_reason: null,
      },
      {
        id: rejectedId,
        ...base,
        headline: `TEST_MODERATION_GATING rejected ${nonce}`,
        fingerprint: `test moderation rejected ${nonce}|education`,
        moderation_status: "rejected",
        moderation_reason: "Political",
        deleted_at: now,
        deleted_by_user_id: "test-moderation-script",
        delete_reason: "Political",
      },
    ]);
    if (insertError) {
      if (isMissingModerationSchemaError(insertError.message)) {
        skipped = true;
        console.log("\n⚠️  Skipping moderation gating test: moderation schema not applied yet.");
        console.log("    Apply migration 055_article_moderation_state.sql, then re-run.");
        return;
      }
      throw new Error(insertError.message);
    }

    insertedIds.push(approvedId, flaggedId, rejectedId);

    const feedRows = await getArticlesForFeed(category, 25, []);
    const feedIds = new Set(feedRows.map((row) => row.id));
    assert(feedIds.has(approvedId), "Feed includes approved article");
    assert(!feedIds.has(flaggedId), "Feed excludes flagged article");
    assert(!feedIds.has(rejectedId), "Feed excludes rejected/soft-deleted article");

    await assertApprovedInRandomPool(approvedId);
    const randomRows = await getRandomAvailableArticles(50, []);
    const randomIds = new Set(randomRows.map((row) => row.id));
    assert(!randomIds.has(flaggedId), "Random pool excludes flagged article");
    assert(!randomIds.has(rejectedId), "Random pool excludes rejected article");
  } finally {
    await cleanup();
  }

  if (skipped) {
    process.exit(0);
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
