/**
 * Persist English normalization for likely non-English ingest/news rows.
 *
 * Candidate selection uses a combined filter (not locale-only):
 * - source=ingest, content_kind=news, not deleted
 * - locale signal OR text-language heuristic
 *
 * Requires DEEPL_API_KEY. Default is DRY RUN (no writes).
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-translate-non-english.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-translate-non-english.ts --apply dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-translate-non-english.ts --apply --max-rows=120 --scan-limit=2400 dotenv_config_path=.env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { runArticleTranslationNormalization } from "../lib/translation/articleNormalization";

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  const fromEq = process.argv.find((arg) => arg.startsWith(prefix));
  if (fromEq) return fromEq.slice(prefix.length);
  return process.argv.includes(exact) ? "true" : null;
}

function parseIntArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 120);
  const scanLimit = parseIntArg("scan-limit", 2400);

  console.log(
    `[translation-backfill] ${apply ? "APPLY" : "dry-run"} maxRows=${maxRows} scanLimit=${scanLimit}`
  );

  const summary = await runArticleTranslationNormalization({
    apply,
    maxRows,
    scanLimit,
    reason: "script_backfill",
  });

  console.log(
    `[translation-backfill] scanned=${summary.scanned} candidates=${summary.candidates} translated=${summary.translated} skipped=${summary.skipped} unavailable=${summary.unavailableCount} failures=${summary.failures}`
  );
  if (!apply) console.log("[translation-backfill] Dry run only. Pass --apply to persist updates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
