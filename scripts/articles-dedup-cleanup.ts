/**
 * Cleanup near-duplicate articles by headline fingerprint similarity.
 *
 * Default mode is DRY RUN (no deletes). Use --execute to actually delete.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-dedup-cleanup.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-dedup-cleanup.ts --execute dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-dedup-cleanup.ts --min-similarity=0.9 --lookback-days=30
 */

import { db } from "../lib/db/client";

interface ArticleLite {
  id: string;
  headline: string;
  category: string;
  fingerprint: string;
  fetched_at: string;
  used_count: number | null;
  quality_score: number | null;
}

interface GroupSummary {
  keepId: string;
  keepHeadline: string;
  removed: ArticleLite[];
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  const fromEq = process.argv.find((arg) => arg.startsWith(prefix));
  if (fromEq) return fromEq.slice(prefix.length);
  return process.argv.includes(exact) ? "true" : null;
}

function parseFloatArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function tokenizeFingerprint(fp: string): string[] {
  const headlinePart = (fp.split("|")[0] ?? fp)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!headlinePart) return [];
  return headlinePart
    .split(" ")
    .filter(Boolean)
    .map((t) => (t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t));
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const t of aSet) if (bSet.has(t)) intersection += 1;
  const union = aSet.size + bSet.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function scoreArticle(a: ArticleLite): number {
  const used = a.used_count ?? 0;
  const quality = a.quality_score ?? 0;
  const recency = Date.parse(a.fetched_at) / 1_000_000_000_000;
  return used * 1000 + quality * 100 + recency;
}

function isNearDuplicate(a: ArticleLite, b: ArticleLite, minSim: number): boolean {
  if (a.category !== b.category) return false;
  if (a.fingerprint === b.fingerprint) return true;

  const aTokens = tokenizeFingerprint(a.fingerprint);
  const bTokens = tokenizeFingerprint(b.fingerprint);
  const sim = jaccardSimilarity(aTokens, bTokens);
  if (sim >= minSim) return true;

  const aHeadline = (a.fingerprint.split("|")[0] ?? "").trim();
  const bHeadline = (b.fingerprint.split("|")[0] ?? "").trim();
  if (!aHeadline || !bHeadline) return false;
  return aHeadline.includes(bHeadline) || bHeadline.includes(aHeadline);
}

async function loadCandidates(lookbackDays: number): Promise<ArticleLite[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("articles")
    .select("id,headline,category,fingerprint,fetched_at,used_count,quality_score")
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`loadCandidates: ${error.message}`);
  return (data ?? []) as ArticleLite[];
}

function buildCleanupGroups(rows: ArticleLite[], minSim: number): GroupSummary[] {
  const byCategory = new Map<string, ArticleLite[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  const groups: GroupSummary[] = [];

  for (const [, list] of byCategory) {
    const consumed = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const seed = list[i];
      if (!seed || consumed.has(seed.id)) continue;

      const cluster: ArticleLite[] = [seed];
      for (let j = i + 1; j < list.length; j++) {
        const candidate = list[j];
        if (!candidate || consumed.has(candidate.id)) continue;
        if (isNearDuplicate(seed, candidate, minSim)) {
          cluster.push(candidate);
        }
      }

      if (cluster.length === 1) continue;

      cluster.sort((a, b) => scoreArticle(b) - scoreArticle(a));
      const keep = cluster[0];
      const remove = cluster.slice(1);
      consumed.add(keep.id);
      for (const loser of remove) consumed.add(loser.id);

      groups.push({
        keepId: keep.id,
        keepHeadline: keep.headline,
        removed: remove,
      });
    }
  }

  return groups;
}

async function deleteByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await db
      .from("articles")
      .delete()
      .in("id", chunk)
      .select("id");
    if (error) throw new Error(`deleteByIds: ${error.message}`);
    deleted += data?.length ?? 0;
  }
  return deleted;
}

async function main() {
  const DRY_RUN = !process.argv.includes("--execute");
  if (DRY_RUN) {
    console.log("DRY RUN mode — pass --execute to actually write changes");
  }
  const minSimilarity = parseFloatArg("min-similarity", 0.88);
  const lookbackDays = parseIntArg("lookback-days", 21);

  console.log("══════════════════════════════════════════════");
  console.log("  Article Near-Duplicate Cleanup");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no deletes)" : "EXECUTE (will delete)"}`);
  console.log(`Similarity threshold: ${minSimilarity}`);
  console.log(`Lookback window: ${lookbackDays} days`);

  const rows = await loadCandidates(lookbackDays);
  const groups = buildCleanupGroups(rows, minSimilarity);
  const idsToDelete = groups.flatMap((g) => g.removed.map((r) => r.id));

  console.log(`Scanned rows: ${rows.length}`);
  console.log(`Duplicate groups: ${groups.length}`);
  console.log(`Rows marked for removal: ${idsToDelete.length}`);

  for (const g of groups.slice(0, 8)) {
    console.log(`\nKeep:   ${g.keepHeadline} (${g.keepId})`);
    for (const loser of g.removed.slice(0, 3)) {
      console.log(`Delete: ${loser.headline} (${loser.id})`);
    }
    if (g.removed.length > 3) {
      console.log(`... and ${g.removed.length - 3} more`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run with --execute to delete marked duplicates.");
    return;
  }

  const deleted = await deleteByIds(idsToDelete);
  console.log(`\nDeleted rows: ${deleted}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});

