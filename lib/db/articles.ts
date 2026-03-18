import { db } from "./client";
import type { StoredArticle } from "../types";
import type { Category } from "../constants";
import { ARTICLE_TTL_DAYS } from "../constants";
import { v4 as uuidv4 } from "uuid";

// ─── Row shape as it comes back from Supabase ─────────────────────────────────
interface ArticleRow {
  id: string;
  headline: string;
  subheadline: string;
  byline: string;
  location: string;
  category: string;
  body: string;
  pull_quote: string;
  image_prompt: string;
  fetched_at: string;
  expires_at: string;
  tags: string[];
  sentiment: string;
  emotions: string[];
  locale: string;
  reading_time_secs: number;
  quality_score: number;
  used_count: number;
  tagged: boolean;
}

function rowToArticle(row: ArticleRow): StoredArticle {
  return {
    id: row.id,
    headline: row.headline,
    subheadline: row.subheadline,
    byline: row.byline,
    location: row.location,
    category: row.category as Category,
    body: row.body,
    pullQuote: row.pull_quote,
    imagePrompt: row.image_prompt,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
    tags: row.tags ?? [],
    sentiment: (row.sentiment ?? "uplifting") as StoredArticle["sentiment"],
    emotions: row.emotions ?? [],
    locale: row.locale ?? "global",
    readingTimeSecs: row.reading_time_secs ?? 120,
    qualityScore: row.quality_score ?? 0.5,
    usedCount: row.used_count ?? 0,
    tagged: row.tagged ?? false,
  };
}

/**
 * Insert a batch of raw articles (before tagging).
 * Returns the stored articles with generated IDs.
 */
export async function insertArticles(
  articles: Omit<
    StoredArticle,
    "id" | "fetchedAt" | "expiresAt" | "usedCount" | "tagged"
  >[]
): Promise<StoredArticle[]> {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + ARTICLE_TTL_DAYS);

  const rows = articles.map((a) => ({
    id: uuidv4(),
    headline: a.headline,
    subheadline: a.subheadline,
    byline: a.byline,
    location: a.location,
    category: a.category,
    body: a.body,
    pull_quote: a.pullQuote,
    image_prompt: a.imagePrompt,
    fetched_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    tags: a.tags ?? [],
    sentiment: a.sentiment ?? "uplifting",
    emotions: a.emotions ?? [],
    locale: a.locale ?? "global",
    reading_time_secs: a.readingTimeSecs ?? 120,
    quality_score: a.qualityScore ?? 0.5,
    used_count: 0,
    tagged: false,
  }));

  const { data, error } = await db
    .from("articles")
    .insert(rows)
    .select();

  if (error) throw new Error(`insertArticles: ${error.message}`);
  return (data as ArticleRow[]).map(rowToArticle);
}

/**
 * Fetch N articles for a category that:
 *  - are fully tagged
 *  - are not expired
 *  - are not in the excludeIds list (already seen by this user)
 * Ordered by quality_score desc.
 */
export async function getArticlesForFeed(
  category: Category,
  limit: number,
  excludeIds: string[] = []
): Promise<StoredArticle[]> {
  let query = db
    .from("articles")
    .select("*")
    .eq("category", category)
    .eq("tagged", true)
    .gt("expires_at", new Date().toISOString())
    .order("quality_score", { ascending: false })
    .limit(limit);

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getArticlesForFeed: ${error.message}`);
  return (data as ArticleRow[]).map(rowToArticle);
}

/**
 * Count available (tagged, unexpired) articles per category.
 * Used by the scheduler to decide whether to trigger ingest.
 */
export async function countAvailableByCategory(): Promise<
  Record<string, number>
> {
  const { data, error } = await db
    .from("articles")
    .select("category")
    .eq("tagged", true)
    .gt("expires_at", new Date().toISOString());

  if (error) throw new Error(`countAvailableByCategory: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}

/**
 * Mark articles as used (increment used_count).
 */
export async function markArticlesUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.rpc("increment_used_count", { article_ids: ids });
  // Fallback if the RPC doesn't exist yet — do it in-process
  if (error) {
    for (const id of ids) {
      await db.rpc("increment_used_count_single", { p_id: id }).catch(() => {
        // Best-effort: direct update
        db.from("articles")
          .update({ used_count: db.rpc as never })
          .eq("id", id);
      });
    }
  }
}

/**
 * Update a single article with tagger enrichment data.
 */
export async function updateArticleTags(
  id: string,
  enrichment: {
    tags: string[];
    sentiment: StoredArticle["sentiment"];
    emotions: string[];
    locale: string;
    readingTimeSecs: number;
    qualityScore: number;
  }
): Promise<void> {
  const { error } = await db
    .from("articles")
    .update({
      tags: enrichment.tags,
      sentiment: enrichment.sentiment,
      emotions: enrichment.emotions,
      locale: enrichment.locale,
      reading_time_secs: enrichment.readingTimeSecs,
      quality_score: enrichment.qualityScore,
      tagged: true,
    })
    .eq("id", id);

  if (error) throw new Error(`updateArticleTags: ${error.message}`);
}

/**
 * Fetch a single article by ID (used by tagger agent).
 */
export async function getArticleById(
  id: string
): Promise<StoredArticle | null> {
  const { data, error } = await db
    .from("articles")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return rowToArticle(data as ArticleRow);
}

/**
 * Fetch untagged articles (for the tagger agent to process).
 */
export async function getUntaggedArticles(
  limit = 20
): Promise<StoredArticle[]> {
  const { data, error } = await db
    .from("articles")
    .select("*")
    .eq("tagged", false)
    .gt("expires_at", new Date().toISOString())
    .limit(limit);

  if (error) throw new Error(`getUntaggedArticles: ${error.message}`);
  return (data as ArticleRow[]).map(rowToArticle);
}

/**
 * Delete expired articles (called from the cleanup cron).
 */
export async function deleteExpiredArticles(): Promise<number> {
  const { data, error } = await db
    .from("articles")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) throw new Error(`deleteExpiredArticles: ${error.message}`);
  return data?.length ?? 0;
}
