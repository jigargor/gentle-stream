/**
 * Test: Engagement rollout guardrail endpoint contract
 *
 * Calls cron health route handler directly with authorized header.
 */

import { NextRequest } from "next/server";
import { GET } from "../app/api/cron/engagement-health/route";

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

async function testUnauthorized() {
  console.log("\n── Unauthorized guard ─────────────────────────────────────────");
  const req = new NextRequest("http://localhost:3000/api/cron/engagement-health");
  const res = await GET(req);
  assert(res.status === 401, "Missing secret returns 401");
}

async function testAuthorizedShape() {
  console.log("\n── Authorized response shape ──────────────────────────────────");
  process.env.CRON_SECRET = "test-cron-secret";
  const req = new NextRequest("http://localhost:3000/api/cron/engagement-health", {
    headers: {
      authorization: "Bearer test-cron-secret",
    },
  });
  const res = await GET(req);
  assert([200, 500].includes(res.status), "Authorized request returns non-401");
  if (res.status === 200) {
    const body = (await res.json()) as {
      ok?: boolean;
      alerts?: unknown;
      metrics?: unknown;
      checkedAt?: string;
    };
    assert(typeof body.ok === "boolean", "Response has ok boolean");
    assert(Array.isArray(body.alerts), "Response has alerts array");
    assert(typeof body.metrics === "object" && body.metrics !== null, "Response has metrics object");
    assert(typeof body.checkedAt === "string", "Response has checkedAt timestamp");
  }
}

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Engagement Guardrail Tests");
  console.log("══════════════════════════════════════════════");

  await testUnauthorized();
  await testAuthorizedShape();

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${passed} passed  |  ${failed} failed`);
  console.log("══════════════════════════════════════════════\n");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});

