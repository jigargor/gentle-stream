/**
 * Standalone Ingest + Tagger Script
 *
 * Run from the project root:
 *   npx tsx scripts/ingest/run.ts
 *   npx tsx scripts/ingest/run.ts --category "Science & Discovery"
 *   npx tsx scripts/ingest/run.ts --all --count 6
 *
 * This script is a development-only tool. In production the cron jobs
 * (app/api/cron/*) handle ingestion automatically on Vercel.
 *
 * Flags:
 *   --all                 Ingest all categories (default if no --category given)
 *   --category <name>     Ingest a single category
 *   --count <n>           Articles to fetch per category (default: 6)
 *   --tag-only            Skip ingest, only run the tagger on existing untagged articles
 *   --no-tag              Skip tagger after ingest
 */

import { config } from "dotenv";

// Next.js uses .env.local — load it explicitly before any lib imports
config({ path: ".env.local" });
import { CATEGORIES } from "../../lib/constants";
import type { Category } from "../../lib/constants";

type IngestAgentModule = typeof import("../../lib/agents/ingestAgent");
type TaggerAgentModule = typeof import("../../lib/agents/taggerAgent");
type ArticlesModule = typeof import("../../lib/db/articles");

// Supabase-dependent modules are loaded dynamically after dotenv config.
let runIngestAgent: IngestAgentModule["runIngestAgent"] | null = null;
let runTaggerAgent: TaggerAgentModule["runTaggerAgent"] | null = null;
let countAvailableByCategory:
  | ArticlesModule["countAvailableByCategory"]
  | null = null;

// ─── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(flag: string): string | null {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const categoryArg = getFlag("--category");
const countArg = parseInt(getFlag("--count") ?? "6", 10);
const tagOnly = hasFlag("--tag-only");
const noTag = hasFlag("--no-tag");
const doAll = hasFlag("--all") || (!categoryArg && !tagOnly);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function separator(char = "─", width = 60) {
  console.log(char.repeat(width));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

// ─── Stock report ─────────────────────────────────────────────────────────────

async function printStockReport() {
  if (!countAvailableByCategory) throw new Error("countAvailableByCategory not loaded");
  console.log("\n📊 Current DB stock (tagged, unexpired articles):\n");
  const counts = await countAvailableByCategory();
  for (const cat of CATEGORIES) {
    const n = counts[cat] ?? 0;
    const bar = "█".repeat(Math.min(n, 30)) + "░".repeat(Math.max(0, 10 - Math.min(n, 10)));
    const status = n === 0 ? "⚠️  EMPTY" : n < 5 ? "⚠️  LOW" : "✓";
    console.log(`  ${status.padEnd(10)} ${cat.padEnd(26)} ${String(n).padStart(3)} articles  ${bar}`);
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  separator("═");
  console.log("  Gentle Stream — Ingest Script");
  separator("═");
  console.log();

  // Validate env
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌  ANTHROPIC_API_KEY is not set. Check your .env.local file.");
    process.exit(1);
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌  Supabase env vars missing. Check your .env.local file.");
    process.exit(1);
  }

  // Load Supabase-dependent modules only after env validation.
  const ingestAgent = (await import("../../lib/agents/ingestAgent")) as IngestAgentModule;
  runIngestAgent = ingestAgent.runIngestAgent;

  const taggerAgent = (await import("../../lib/agents/taggerAgent")) as TaggerAgentModule;
  runTaggerAgent = taggerAgent.runTaggerAgent;

  const articles = (await import("../../lib/db/articles")) as ArticlesModule;
  countAvailableByCategory = articles.countAvailableByCategory;

  // Print stock before
  await printStockReport();

  // ── Tag-only mode ──────────────────────────────────────────────────────────
  if (tagOnly) {
    console.log("🏷️  Running tagger on all untagged articles...\n");
    if (!runTaggerAgent) throw new Error("runTaggerAgent not loaded");
    await runTaggerAgent(50);
    console.log("\n✅ Tagging complete.");
    await printStockReport();
    process.exit(0);
  }

  // ── Ingest ─────────────────────────────────────────────────────────────────
  if (doAll) {
    console.log(`📥 Ingesting ALL categories — ${countArg} articles each\n`);
    separator();

    // Run categories sequentially to guarantee we never fetch multiple articles
    // concurrently (avoids rate-limit spikes across categories).
    let succeeded = 0;
    for (const cat of CATEGORIES) {
      const t = Date.now();
      if (!runIngestAgent) throw new Error("runIngestAgent not loaded");

      try {
        const result = await runIngestAgent(cat as Category, countArg);
        const duration = formatDuration(Date.now() - t);
        if (result.error) {
          console.log(`  ❌ ${cat.padEnd(28)} error: ${result.error}`);
        } else {
          console.log(
            `  ✓  ${cat.padEnd(28)} ${result.inserted.length} articles  (${duration})`
          );
          succeeded += 1;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ❌ ${cat.padEnd(28)} error: ${msg}`);
      }
    }
    console.log();
    separator();
    console.log(`  Ingest complete: ${succeeded}/${CATEGORIES.length} categories succeeded`);

  } else if (categoryArg) {
    const cat = CATEGORIES.find(
      (c) => c.toLowerCase() === categoryArg.toLowerCase()
    );
    if (!cat) {
      console.error(`❌  Unknown category: "${categoryArg}"`);
      console.error(`    Valid categories: ${CATEGORIES.join(", ")}`);
      process.exit(1);
    }

    console.log(`📥 Ingesting "${cat}" — ${countArg} articles\n`);
    separator();

    const result = await runIngestAgent(cat as Category, countArg);
    if (result.error) {
      console.log(`\n❌  Error: ${result.error}`);
    } else {
      console.log(`\n✓  Inserted ${result.inserted.length} articles`);
    }
  }

  // ── Tag newly ingested articles ────────────────────────────────────────────
  if (!noTag) {
    console.log("\n🏷️  Running tagger on new articles...\n");
    separator();
    if (!runTaggerAgent) throw new Error("runTaggerAgent not loaded");
    await runTaggerAgent(50);
    console.log("\n✓  Tagging complete");
  }

  // Print stock after
  await printStockReport();

  separator("═");
  console.log(`  Done in ${formatDuration(Date.now() - startTime)}`);
  separator("═");

  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌  Fatal error:", e);
  process.exit(1);
});
