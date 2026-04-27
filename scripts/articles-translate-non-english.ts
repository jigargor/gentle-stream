/**
 * Translate likely non-English ingest articles to English (DeepL) and optionally update the DB.
 *
 * The in-app feed uses POST /api/articles/translate for on-demand display; this script persists
 * English headline/subheadline/body on recent ingest rows.
 *
 * Requires DEEPL_API_KEY (see .env.example). Default is DRY RUN (no writes).
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-translate-non-english.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-translate-non-english.ts --apply dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-translate-non-english.ts --apply --max-rows=25 dotenv_config_path=.env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { buildHeadlineFingerprint } from "../lib/db/articles";
import { db } from "../lib/db/client";
import { translateTextsWithDeepL } from "../lib/translation/deepl";

const MAX_FIELD_CHARS = 45_000;
const SCAN_LIMIT = 800;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 15);

  const { data, error } = await db
    .from("articles")
    .select("id,category,headline,subheadline,body")
    .eq("source", "ingest")
    .eq("content_kind", "news")
    .is("deleted_at", null)
    .order("fetched_at", { ascending: false })
    .limit(SCAN_LIMIT);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    category: string;
    headline: string;
    subheadline: string | null;
    body: string | null;
  }[];

  const candidates = rows.slice(0, maxRows);

  console.log(
    `Found ${candidates.length} candidate(s) (max ${maxRows}) — ${apply ? "APPLY" : "dry run"}`
  );

  if (candidates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let updated = 0;
  for (const row of candidates) {
    const body = row.body ?? "";
    const bodyForApi = body.length > MAX_FIELD_CHARS ? body.slice(0, MAX_FIELD_CHARS) : body;
    if (body.length > MAX_FIELD_CHARS) {
      console.warn(`[${row.id}] body truncated to ${MAX_FIELD_CHARS} chars for DeepL`);
    }

    const out = await translateTextsWithDeepL({
      texts: [row.headline, row.subheadline ?? "", bodyForApi],
      targetLang: "EN",
    });

    if (!out) {
      console.error(
        "DeepL returned no translation (missing DEEPL_API_KEY, HTTP error, or empty response). Stopping."
      );
      process.exit(1);
    }

    const [headlineEn, subEn, bodyEn] = out.texts;
    console.log(
      `- ${row.id.slice(0, 8)}…  ${out.detectedSourceLanguage ?? "?"} → EN  |  ${row.headline.slice(0, 56)}…`
    );

    if (!apply) continue;

    const fp = buildHeadlineFingerprint(headlineEn, row.category);
    const { error: upErr } = await db
      .from("articles")
      .update({
        headline: headlineEn,
        subheadline: subEn || null,
        body: bodyEn,
        fingerprint: fp,
      })
      .eq("id", row.id);

    if (upErr) throw new Error(`update ${row.id}: ${upErr.message}`);
    updated += 1;
    await sleep(250);
  }

  if (apply) console.log(`\nUpdated ${updated} row(s).`);
  else console.log("\nDry run only. Pass --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
