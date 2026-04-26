/**
 * Burst load probe for creator draft autosave endpoint.
 *
 * Usage:
 *   SESSION_COOKIE="sb-access-token=...; sb-refresh-token=..." \
 *   BASE_URL="http://localhost:3000" \
 *   DRAFT_ID="uuid" \
 *   npx tsx scripts/loadtest-draft-autosave.ts
 */

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const draftId = process.env.DRAFT_ID ?? "";
const sessionCookie = process.env.SESSION_COOKIE ?? "";

if (!draftId || !sessionCookie) {
  console.error("Missing DRAFT_ID or SESSION_COOKIE.");
  process.exit(1);
}

async function run() {
  const concurrency = 12;
  const bursts = 8;
  let expectedRevision = Number(process.env.START_REVISION ?? "1");
  for (let burst = 0; burst < bursts; burst += 1) {
    const tasks = Array.from({ length: concurrency }).map(async (_, idx) => {
      const body = {
        expectedRevision,
        title: `Loadtest burst ${burst} #${idx}`,
        body: `Autosave payload ${burst}-${idx} ${Date.now()}`,
        autosave: true,
      };
      const res = await fetch(`${baseUrl}/api/creator/drafts/${draftId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          Origin: baseUrl,
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, text: await res.text() };
    });
    const results = await Promise.all(tasks);
    const byStatus = results.reduce<Record<number, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    console.info("[autosave-burst]", { burst, byStatus });
    const success = results.find((row) => row.status === 200);
    if (success) expectedRevision += 1;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
