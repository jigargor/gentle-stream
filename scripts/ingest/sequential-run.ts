/**
 * Sequential ingest: one article per category round, tag each before the next ingest.
 *
 *   npx tsx scripts/ingest/sequential-run.ts
 *
 * On startup, waits ~8s so you can Ctrl+C to exit; after that, runs until Anthropic
 * credits/token paths stop progress or you press Ctrl+C again.
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { CATEGORIES } from "../../lib/constants";
import type { Category } from "../../lib/constants";
import { getEnv } from "../../lib/env";
import { resolveIngestDiscoveryProvider } from "../../lib/agents/ingestDiscoveryProvider";

const COUNTDOWN_SEC = 8;
const DEFAULT_RSS_ITEMS_PER_FEED = 8;
const DEFAULT_RSS_ITEMS_PER_FEED_MAX = 24;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Check .env.local.");
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase env vars missing. Check .env.local.");
    process.exit(1);
  }

  const ingestAgent = await import("../../lib/agents/ingestAgent");
  const taggerAgent = await import("../../lib/agents/taggerAgent");
  const articlesDb = await import("../../lib/db/articles");

  const env = getEnv();
  const discoveryProvider = resolveIngestDiscoveryProvider(env.INGEST_DISCOVERY_PROVIDER);
  const baseRssItemsPerFeed = Math.max(
    1,
    Number(process.env.RSS_DISCOVERY_ITEMS_PER_FEED ?? DEFAULT_RSS_ITEMS_PER_FEED)
  );
  const maxRssItemsPerFeed = Math.max(
    baseRssItemsPerFeed,
    Number(
      process.env.RSS_DISCOVERY_ITEMS_PER_FEED_MAX ?? DEFAULT_RSS_ITEMS_PER_FEED_MAX
    )
  );

  let shouldStop = false;
  function onSigInt() {
    shouldStop = true;
    console.log("\n[sequential-ingest] Stopping (Ctrl+C)…");
  }
  process.on("SIGINT", onSigInt);

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  Gentle Stream — sequential ingest + tag");
  console.log(`  You have ${COUNTDOWN_SEC}s to press Ctrl+C to exit before the loop starts.`);
  console.log("══════════════════════════════════════════════════════════\n");

  for (let s = COUNTDOWN_SEC; s > 0; s--) {
    if (shouldStop) {
      process.exit(0);
    }
    console.log(`  Starting in ${s}s… (Ctrl+C to exit)`);
    await sleep(1000);
  }

  if (shouldStop) process.exit(0);

  console.log("\n  Running. Press Ctrl+C anytime to stop.\n");

  let catIndex = 0;
  let iteration = 0;

  while (!shouldStop) {
    iteration += 1;
    const cat = CATEGORIES[catIndex % CATEGORIES.length] as Category;
    catIndex += 1;

    try {
      const result = await ingestAgent.runIngestAgent(cat, 1, { discoveryProvider });

      if (shouldStop) break;

      if (result.stoppedEarly && result.inserted.length === 0) {
        console.log(
          `[${iteration}] "${cat}" — stopped early (budget) with no insert; exiting to avoid a tight loop.`
        );
        break;
      }

      if (result.inserted.length === 0) {
        console.log(`[${iteration}] "${cat}" — no article inserted (skipped/dup/budget). Continuing…`);
        continue;
      }

      for (const article of result.inserted) {
        if (shouldStop) break;
        console.log(`[${iteration}] Ingested "${article.headline.slice(0, 72)}…" — tagging…`);
        const tagOutcome = await taggerAgent.tagArticleById(article.id);
        if (tagOutcome === "credits_exhausted") {
          console.error("[sequential-ingest] Tagger reports Anthropic credits exhausted. Stopping.");
          shouldStop = true;
          break;
        }
        if (tagOutcome === "not_found") {
          console.warn(`[sequential-ingest] Article ${article.id} not found after insert (unexpected).`);
        } else if (tagOutcome === "api_error" || tagOutcome === "parse_error") {
          console.warn(`[sequential-ingest] Tag outcome: ${tagOutcome} for ${article.id}`);
        } else {
          console.log(`[${iteration}] Tagged (${tagOutcome}).`);
        }
        const tagged = await articlesDb.getArticleById(article.id);
        const moderationStatus = tagged?.moderationStatus ?? "approved";
        if (moderationStatus === "flagged" || moderationStatus === "rejected") {
          console.warn(
            `[${iteration}] Moderation=${moderationStatus}. Retrying "${cat}" with deeper RSS XML slices.`
          );
          let depth = baseRssItemsPerFeed;
          let approvedFound = false;
          while (!shouldStop && depth <= maxRssItemsPerFeed) {
            process.env.RSS_DISCOVERY_ITEMS_PER_FEED = String(depth);
            console.log(
              `[${iteration}] Retry depth RSS_DISCOVERY_ITEMS_PER_FEED=${depth} for "${cat}"…`
            );
            const retryResult = await ingestAgent.runIngestAgent(cat, 1, { discoveryProvider });
            if (retryResult.inserted.length === 0) {
              depth += 2;
              continue;
            }
            for (const retryArticle of retryResult.inserted) {
              const retryTag = await taggerAgent.tagArticleById(retryArticle.id);
              if (retryTag === "credits_exhausted") {
                console.error("[sequential-ingest] Credits exhausted during moderation retry.");
                shouldStop = true;
                break;
              }
              const retryTagged = await articlesDb.getArticleById(retryArticle.id);
              const retryStatus = retryTagged?.moderationStatus ?? "approved";
              if (retryStatus === "approved") {
                approvedFound = true;
                console.log(
                  `[${iteration}] Found approved replacement at depth=${depth}: "${retryArticle.headline.slice(
                    0,
                    72
                  )}…"`
                );
                break;
              }
            }
            if (approvedFound || shouldStop) break;
            depth += 2;
          }
          process.env.RSS_DISCOVERY_ITEMS_PER_FEED = String(baseRssItemsPerFeed);
          if (!approvedFound) {
            console.warn(
              `[${iteration}] No approved replacement found for "${cat}" up to max depth ${maxRssItemsPerFeed}.`
            );
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${iteration}] "${cat}" ingest error:`, msg);
      if (
        msg.includes("Anthropic credits exhausted") ||
        msg.includes("credits exhausted") ||
        msg.toLowerCase().includes("insufficient credits")
      ) {
        break;
      }
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
