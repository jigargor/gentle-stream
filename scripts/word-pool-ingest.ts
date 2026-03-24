/**
 * Manual word-pool ingest (Claude → game_word_pool).
 *
 *   npx tsx scripts/word-pool-ingest.ts
 *   npx tsx scripts/word-pool-ingest.ts --category "Human Kindness"
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import type { Category } from "../lib/constants";
import { CATEGORIES } from "../lib/constants";
import { runWordSearchPoolIngest } from "../lib/games/wordSearchPoolIngestAgent";

function argCategory(): Category | undefined {
  const i = process.argv.indexOf("--category");
  if (i === -1 || !process.argv[i + 1]) return undefined;
  const name = process.argv[i + 1];
  if (!CATEGORIES.includes(name as Category)) {
    console.error(`Unknown category: ${name}`);
    process.exit(1);
  }
  return name as Category;
}

async function main() {
  const cat = argCategory();
  const n = await runWordSearchPoolIngest(cat);
  console.log(`Inserted ${n} new word row(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
