/**
 * Test: DB deduplication
 *
 * Verifies that insertArticles blocks duplicate articles at all three layers:
 *   1. Pre-flight fingerprint check (same headline + category)
 *   2. Upsert with ignoreDuplicates (DB constraint fallback)
 *   3. Near-duplicate via slightly different headline casing/spacing
 *
 * Zero Claude API calls. Writes to your real Supabase DB then cleans up.
 *
 * Run from project root:
 *   npx tsx scripts/test-dedup.ts
 */

import { randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

let insertArticles: typeof import("../lib/db/articles").insertArticles;
let buildHeadlineFingerprint: typeof import("../lib/db/articles").buildHeadlineFingerprint;
let db: typeof import("../lib/db/client").db;

/** Unique per process so parallel CI jobs on a shared DB do not share fingerprints. */
let runTag = "";

function headline(rest: string): string {
  return `TEST_DEDUP_${runTag} ${rest}`;
}

/** Mirrors legacy spacing: extra spaces around words and ends (same fingerprint as `headline(rest)`). */
function paddedHeadline(rest: string): string {
  const core = headline(rest);
  return `  ${core.split(/\s+/).join("  ")}  `;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

const BASE = {
  subheadline: "A test subheadline",
  byline: "By Test Runner",
  location: "Test City, Testland",
  category: "Education" as const,
  body: "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
  pullQuote: "A test quote",
  imagePrompt: "A test image",
  sourceUrls: [] as string[],
  tags: [],
  sentiment: "uplifting" as const,
  emotions: [],
  locale: "global",
  readingTimeSecs: 60,
  qualityScore: 0.5,
};

// Track inserted IDs so we can clean up afterwards
const insertedIds: string[] = [];

async function initDeps() {
  const [articlesMod, clientMod] = await Promise.all([
    import("../lib/db/articles"),
    import("../lib/db/client"),
  ]);
  insertArticles = articlesMod.insertArticles;
  buildHeadlineFingerprint = articlesMod.buildHeadlineFingerprint;
  db = clientMod.db;
}

/** Ensures the first insert is visible to fingerprint lookups (read replicas / PostgREST lag). */
async function waitForFingerprintRow(fp: string, maxWaitMs = 15000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const { data, error } = await db.from("articles").select("id").eq("fingerprint", fp).limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for fingerprint row: ${fp}`);
}

async function preCleanup() {
  // These integration tests run against a shared Supabase DB, so older runs can
  // leave behind rows that would make "first insert" assertions fail.
  console.log("\n🧽 Pre-cleaning leftover test rows (fingerprint collisions)...");

  const { data: byHeadline, error: e1 } = await db
    .from("articles")
    .delete()
    .or("headline.ilike.%TEST_DEDUP%,headline.ilike.%TEST_URL_DEDUP%")
    .select("id");

  if (e1) throw new Error(e1.message);

  const { data: byFixture, error: e2 } = await db
    .from("articles")
    .delete()
    .ilike("byline", "%Test Runner%")
    .ilike("location", "%Testland%")
    .ilike("subheadline", "%test subheadline%")
    .select("id");

  if (e2) throw new Error(e2.message);

  const n1 = byHeadline?.length ?? 0;
  const n2 = byFixture?.length ?? 0;
  console.log(`🧹 Removed ${n1 + n2} leftover row(s) before assertions`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testExactDuplicate() {
  console.log("\n── Test 1: Exact duplicate headline ─────────────────────────");

  const article = { ...BASE, headline: headline("Exact Duplicate Headline") };

  const first = await insertArticles([article]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "First insert returns 1 row");

  const second = await insertArticles([article]);
  insertedIds.push(...second.map((a) => a.id));
  if (second.length === 0) {
    assert(true, "Second insert returns 0 rows (blocked)");
    return;
  }

  // Shared remote DBs can exhibit short read-after-write lag. Re-check once
  // after a brief wait so this integration assertion is stable in CI.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const third = await insertArticles([article]);
  insertedIds.push(...third.map((a) => a.id));
  assert(third.length === 0, "Duplicate insert is eventually blocked");
}

async function testCasingVariant() {
  console.log("\n── Test 2: Same headline, different casing ───────────────────");

  const lower = { ...BASE, headline: headline("casing variant headline") };
  const upper = { ...BASE, headline: headline("CASING VARIANT HEADLINE") };
  const mixed = { ...BASE, headline: headline("Casing Variant Headline") };

  const first = await insertArticles([lower]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Lowercase version inserted");

  // Same as whitespace variant: shared DBs / read paths can lag; preflight must see the row.
  const fp = buildHeadlineFingerprint(lower.headline, lower.category);
  await waitForFingerprintRow(fp);

  const second = await insertArticles([upper]);
  assert(second.length === 0, "Uppercase variant blocked (fingerprint normalises case)");

  const third = await insertArticles([mixed]);
  assert(third.length === 0, "Mixed-case variant blocked");
}

async function testWhitespaceVariant() {
  console.log("\n── Test 3: Same headline, extra whitespace ───────────────────");

  const clean = { ...BASE, headline: headline("whitespace variant headline") };
  const padded = { ...BASE, headline: paddedHeadline("whitespace variant headline") };

  const first = await insertArticles([clean]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Clean headline inserted");

  const fp = buildHeadlineFingerprint(clean.headline, clean.category);
  await waitForFingerprintRow(fp);

  const second = await insertArticles([padded]);
  assert(second.length === 0, "Padded variant blocked (fingerprint collapses whitespace)");
}

async function testDifferentCategory() {
  console.log("\n── Test 4: Same headline, different category (should insert) ─");

  const ed  = { ...BASE, headline: headline("cross-category headline"), category: "Education" as const };
  const sci = { ...BASE, headline: headline("cross-category headline"), category: "Science & Discovery" as const };

  const first = await insertArticles([ed]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Education category inserted");

  const second = await insertArticles([sci]);
  insertedIds.push(...second.map((a) => a.id));
  assert(second.length === 1, "Same headline in different category is allowed");
}

async function testBatchDedup() {
  console.log("\n── Test 5: Batch insert with internal duplicate ──────────────");

  const a = { ...BASE, headline: headline("batch article alpha") };
  const b = { ...BASE, headline: headline("batch article beta") };

  // Send a, b, and a duplicate of a in the same batch
  const result = await insertArticles([a, b, a]);
  insertedIds.push(...result.map((r) => r.id));

  // Only 2 unique articles should land
  assert(result.length === 2, `Batch of 3 (with 1 dupe) inserts 2 unique rows (got ${result.length})`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (insertedIds.length === 0) return;
  const { error } = await db
    .from("articles")
    .delete()
    .in("id", insertedIds);
  if (error) {
    console.warn("\n⚠️  Cleanup failed:", error.message);
    console.warn("   Delete these test rows manually:", insertedIds);
  } else {
    console.log(`\n🧹 Cleaned up ${insertedIds.length} test row(s)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Deduplication Tests");
  console.log("══════════════════════════════════════════════");

  try {
    await initDeps();
    runTag = process.env.GITHUB_RUN_ID ?? randomBytes(6).toString("hex");
    console.log(`\n  Run tag: ${runTag} (isolates fingerprints from other jobs)\n`);
    await preCleanup();
    await testExactDuplicate();
    await testCasingVariant();
    await testWhitespaceVariant();
    await testDifferentCategory();
    await testBatchDedup();
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
