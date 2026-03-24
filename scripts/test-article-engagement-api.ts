/**
 * Test: Engagement API contract validation
 *
 * Runs contract-level tests against the shared parser used by
 * /api/user/article-engagement.
 *
 * Run:
 *   npx tsx scripts/test-article-engagement-api.ts
 */

import { parseEngagementBatch } from "../lib/engagement/contract";

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

const USER_ID = "test-user-id";
const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";

function testValidBatchAccepted() {
  console.log("\n── Valid payload accepted ─────────────────────────────────────");
  const parsed = parseEngagementBatch(
    {
      events: [
        {
          articleId: ARTICLE_ID,
          eventType: "impression",
          eventValue: 0.75,
          sessionId: "s1",
          context: { source: "feed", sectionIndex: 2 },
        },
      ],
    },
    USER_ID
  );

  assert(parsed.error === null, "No parser error for valid payload");
  assert(parsed.rows.length === 1, "One event row normalized");
  assert(parsed.rows[0]?.user_id === USER_ID, "user_id propagated");
  assert(parsed.rows[0]?.article_id === ARTICLE_ID, "article_id propagated");
}

function testInvalidUuidRejected() {
  console.log("\n── Invalid UUID rejected ──────────────────────────────────────");
  const parsed = parseEngagementBatch(
    {
      events: [
        {
          articleId: "not-a-uuid",
          eventType: "open",
        },
      ],
    },
    USER_ID
  );
  assert(parsed.error === "No valid events", "Invalid UUID gets rejected");
}

function testInvalidEventTypeRejected() {
  console.log("\n── Invalid event type rejected ────────────────────────────────");
  const parsed = parseEngagementBatch(
    {
      events: [
        {
          articleId: ARTICLE_ID,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eventType: "hover" as any,
        },
      ],
    },
    USER_ID
  );
  assert(parsed.error === "No valid events", "Unknown eventType gets rejected");
}

function testBatchCapEnforced() {
  console.log("\n── Batch size cap enforced ────────────────────────────────────");
  const events = Array.from({ length: 101 }, () => ({
    articleId: ARTICLE_ID,
    eventType: "impression" as const,
  }));
  const parsed = parseEngagementBatch({ events }, USER_ID);
  assert(
    (parsed.error ?? "").includes("exceeds max size"),
    "Oversized batches are rejected"
  );
}

function testContextAndTimestampNormalization() {
  console.log("\n── Context/timestamp normalization ────────────────────────────");
  const parsed = parseEngagementBatch(
    {
      events: [
        {
          articleId: ARTICLE_ID,
          eventType: "read_30s",
          occurredAt: "not-a-date",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context: null as any,
        },
      ],
    },
    USER_ID
  );
  assert(parsed.error === null, "Batch accepted with invalid timestamp");
  const row = parsed.rows[0];
  assert(typeof row?.occurred_at === "string", "occurred_at normalized to ISO");
  assert(
    row?.context && Object.keys(row.context).length === 0,
    "null context normalized to {}"
  );
}

function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Engagement API Contract Tests");
  console.log("══════════════════════════════════════════════");

  testValidBatchAccepted();
  testInvalidUuidRejected();
  testInvalidEventTypeRejected();
  testBatchCapEnforced();
  testContextAndTimestampNormalization();

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${passed} passed  |  ${failed} failed`);
  console.log("══════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

main();

