/**
 * Deletes integration-test articles from scripts/test-dedup.ts and
 * scripts/test-url-dedup.ts. Same logic as lib/db/migrations/017 and 018.
 *
 * Run when rows still appear in the app after migrations were not applied:
 *
 *   npm run articles:remove-test-dedup
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db/client";

async function main() {
  const DRY_RUN = !process.argv.includes("--execute");
  if (DRY_RUN) {
    console.log("DRY RUN mode — pass --execute to actually write changes");
  }

  let byHeadline: Array<{ id: string }> = [];
  let byFixture: Array<{ id: string }> = [];
  let byEngagementReco: Array<{ id: string }> = [];

  if (DRY_RUN) {
    const { data, error } = await db
      .from("articles")
      .select("id")
      .or("headline.ilike.%TEST_DEDUP%,headline.ilike.%TEST_URL_DEDUP%");
    if (error) throw new Error(error.message);
    byHeadline = data ?? [];

    const { data: fixtureData, error: fixtureError } = await db
      .from("articles")
      .select("id")
      .ilike("byline", "%Test Runner%")
      .ilike("location", "%Testland%")
      .ilike("subheadline", "%test subheadline%");
    if (fixtureError) throw new Error(fixtureError.message);
    byFixture = fixtureData ?? [];

    const { data: recoData, error: recoError } = await db
      .from("articles")
      .select("id")
      .or(
        "headline.ilike.%TEST_ENG_DB%,headline.ilike.%TEST%ENG%DB%,headline.ilike.%TEST_RECO_E2E%,headline.ilike.%TEST%RECO%E2E%"
      );
    if (recoError) throw new Error(recoError.message);
    byEngagementReco = recoData ?? [];
  } else {
    const { data, error } = await db
      .from("articles")
      .delete()
      .or("headline.ilike.%TEST_DEDUP%,headline.ilike.%TEST_URL_DEDUP%")
      .select("id");
    if (error) throw new Error(error.message);
    byHeadline = data ?? [];

    const { data: fixtureData, error: fixtureError } = await db
      .from("articles")
      .delete()
      .ilike("byline", "%Test Runner%")
      .ilike("location", "%Testland%")
      .ilike("subheadline", "%test subheadline%")
      .select("id");
    if (fixtureError) throw new Error(fixtureError.message);
    byFixture = fixtureData ?? [];

    const { data: recoData, error: recoError } = await db
      .from("articles")
      .delete()
      .or(
        "headline.ilike.%TEST_ENG_DB%,headline.ilike.%TEST%ENG%DB%,headline.ilike.%TEST_RECO_E2E%,headline.ilike.%TEST%RECO%E2E%"
      )
      .select("id");
    if (recoError) throw new Error(recoError.message);
    byEngagementReco = recoData ?? [];
  }

  const n1 = byHeadline?.length ?? 0;
  const n2 = byFixture?.length ?? 0;
  const n3 = byEngagementReco?.length ?? 0;
  const action = DRY_RUN ? "Would remove" : "Removed";
  const totalLabel = DRY_RUN ? "Total candidates" : "Total deleted";
  console.log(
    `${action} ${n1} row(s) matching TEST_DEDUP / TEST_URL_DEDUP in headline.`
  );
  console.log(
    `${action} ${n2} row(s) matching Test Runner + Testland + test subheadline fixture.`
  );
  console.log(`${action} ${n3} row(s) matching TEST_ENG_DB / TEST_RECO_E2E in headline.`);
  console.log(`${totalLabel}: ${n1 + n2 + n3}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
