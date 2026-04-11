/**
 * Strip inline HTML modifier tags from already-ingested article text fields.
 *
 * Default mode is DRY RUN (no updates). Use --apply to write changes.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-strip-inline-html-tags.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-strip-inline-html-tags.ts --apply dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-strip-inline-html-tags.ts --apply --max-rows=5000 dotenv_config_path=.env.local
 */

import { stripInlineHtmlToPlainText } from "@gentle-stream/feed-engine";

import { buildHeadlineFingerprint } from "../lib/db/articles";
import { db } from "../lib/db/client";

interface ArticleRow {
  id: string;
  category: string;
  headline: string;
  subheadline: string | null;
  body: string | null;
  pull_quote: string | null;
  byline: string | null;
  location: string | null;
  image_prompt: string | null;
  fetched_at: string;
}

interface ChangeRow {
  id: string;
  category: string;
  before: {
    headline: string;
    subheadline: string;
    body: string;
    pullQuote: string;
    byline: string;
    location: string;
    imagePrompt: string;
  };
  after: {
    headline: string;
    subheadline: string;
    body: string;
    pullQuote: string;
    byline: string;
    location: string;
    imagePrompt: string;
  };
}

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

function hasInlineHtml(value: string): boolean {
  return /<[^>]+>/.test(value);
}

async function loadCandidates(maxRows: number): Promise<ArticleRow[]> {
  const pageSize = 500;
  const out: ArticleRow[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await db
      .from("articles")
      .select(
        "id,category,headline,subheadline,body,pull_quote,byline,location,image_prompt,fetched_at"
      )
      .or(
        [
          "headline.ilike.%<%",
          "subheadline.ilike.%<%",
          "body.ilike.%<%",
          "pull_quote.ilike.%<%",
          "byline.ilike.%<%",
          "location.ilike.%<%",
          "image_prompt.ilike.%<%",
        ].join(",")
      )
      .order("fetched_at", { ascending: false })
      .range(offset, Math.min(offset + pageSize - 1, maxRows - 1));

    if (error) throw new Error(`loadCandidates: ${error.message}`);
    const rows = (data ?? []) as ArticleRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }

  return out.slice(0, maxRows);
}

function collectChanges(rows: ArticleRow[]): ChangeRow[] {
  const changes: ChangeRow[] = [];
  for (const row of rows) {
    const before = {
      headline: row.headline ?? "",
      subheadline: row.subheadline ?? "",
      body: row.body ?? "",
      pullQuote: row.pull_quote ?? "",
      byline: row.byline ?? "",
      location: row.location ?? "",
      imagePrompt: row.image_prompt ?? "",
    };
    if (
      !hasInlineHtml(before.headline) &&
      !hasInlineHtml(before.subheadline) &&
      !hasInlineHtml(before.body) &&
      !hasInlineHtml(before.pullQuote) &&
      !hasInlineHtml(before.byline) &&
      !hasInlineHtml(before.location) &&
      !hasInlineHtml(before.imagePrompt)
    ) {
      continue;
    }

    const after = {
      headline: stripInlineHtmlToPlainText(before.headline),
      subheadline: stripInlineHtmlToPlainText(before.subheadline),
      body: stripInlineHtmlToPlainText(before.body),
      pullQuote: stripInlineHtmlToPlainText(before.pullQuote),
      byline: stripInlineHtmlToPlainText(before.byline),
      location: stripInlineHtmlToPlainText(before.location),
      imagePrompt: stripInlineHtmlToPlainText(before.imagePrompt),
    };

    if (
      before.headline === after.headline &&
      before.subheadline === after.subheadline &&
      before.body === after.body &&
      before.pullQuote === after.pullQuote &&
      before.byline === after.byline &&
      before.location === after.location &&
      before.imagePrompt === after.imagePrompt
    ) {
      continue;
    }

    changes.push({
      id: row.id,
      category: row.category,
      before,
      after,
    });
  }
  return changes;
}

async function applyChanges(changes: ChangeRow[]): Promise<number> {
  let updated = 0;
  for (const change of changes) {
    const { data, error } = await db
      .from("articles")
      .update({
        headline: change.after.headline,
        subheadline: change.after.subheadline,
        body: change.after.body,
        pull_quote: change.after.pullQuote,
        byline: change.after.byline,
        location: change.after.location,
        image_prompt: change.after.imagePrompt,
        fingerprint: buildHeadlineFingerprint(change.after.headline, change.category),
      })
      .eq("id", change.id)
      .select("id");

    if (error) throw new Error(`applyChanges(${change.id}): ${error.message}`);
    updated += data?.length ?? 0;
  }
  return updated;
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 5000);

  console.log("══════════════════════════════════════════════");
  console.log("  Article Inline HTML Tag Cleanup");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${apply ? "APPLY (will update)" : "DRY RUN (no updates)"}`);
  console.log(`Scan max rows: ${maxRows}`);

  const rows = await loadCandidates(maxRows);
  const changes = collectChanges(rows);
  console.log(`Rows scanned: ${rows.length}`);
  console.log(`Rows needing patch: ${changes.length}`);

  for (const sample of changes.slice(0, 12)) {
    console.log(`\n[${sample.id}]`);
    console.log(`Before headline: ${sample.before.headline}`);
    console.log(`After headline:  ${sample.after.headline}`);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to patch these rows.");
    return;
  }

  const updated = await applyChanges(changes);
  console.log(`\nUpdated rows: ${updated}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
