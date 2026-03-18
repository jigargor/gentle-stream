/**
 * Ranker Agent
 *
 * Pure TypeScript — no LLM call. Scores and selects articles from the DB
 * for a specific user. Fast enough to run on every feed request.
 *
 * Scoring formula:
 *   score = qualityScore
 *         × categoryWeight       (from user profile)
 *         × emotionBoost         (if article emotion matches user preferences)
 *         × localeBoost          (if article locale matches user preferences)
 *         × freshnessFactor      (newer articles score higher)
 *         × noveltyPenalty       (used_count > N gets penalised)
 */

import { getArticlesForFeed } from "../db/articles";
import { getOrCreateUserProfile, markArticlesSeen } from "../db/users";
import type { StoredArticle, UserProfile } from "../types";
import type { Category } from "../constants";
import { CATEGORIES, DEFAULT_CATEGORY_WEIGHTS } from "../constants";

export interface RankedFeedResult {
  articles: StoredArticle[];
  fromCache: true;
  category: string;
}

interface RankOptions {
  userId: string;
  category?: Category | null;   // null = rotate through weighted categories
  sectionIndex: number;
  pageSize?: number;             // articles per section (default 3)
  markSeen?: boolean;            // default true
}

/**
 * Main entry point. Returns a ranked page of articles for a user.
 */
export async function getRankedFeed(
  options: RankOptions
): Promise<RankedFeedResult> {
  const { userId, category, sectionIndex, pageSize = 3, markSeen = true } = options;

  const profile = await getOrCreateUserProfile(userId);

  // Decide which category to serve
  const resolvedCategory = category ?? pickCategory(profile, sectionIndex);

  // Fetch a candidate pool (fetch more than needed so we can rank and trim)
  const poolSize = pageSize * 5;
  const candidates = await getArticlesForFeed(
    resolvedCategory,
    poolSize,
    profile.seenArticleIds
  );

  // Score and rank
  const scored = candidates.map((a) => ({
    article: a,
    score: scoreArticle(a, profile),
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, pageSize).map((s) => s.article);

  // Mark as seen so they don't repeat in this user's feed
  if (markSeen && selected.length > 0) {
    await markArticlesSeen(userId, selected.map((a) => a.id));
  }

  return {
    articles: selected,
    fromCache: true,
    category: resolvedCategory,
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreArticle(article: StoredArticle, profile: UserProfile): number {
  const base = article.qualityScore;

  const categoryWeight =
    profile.categoryWeights[article.category as Category] ??
    DEFAULT_CATEGORY_WEIGHTS[article.category as Category] ??
    0.125;

  const emotionBoost = emotionMatch(article.emotions, profile.preferredEmotions);
  const localeBoost = localeMatch(article.locale, profile.preferredLocales);
  const freshness = freshnessFactor(article.fetchedAt);
  const novelty = noveltyPenalty(article.usedCount);

  return base * categoryWeight * 8 * emotionBoost * localeBoost * freshness * novelty;
  // × 8 to re-scale: categoryWeight averages 0.125, × 8 brings it back to ≈ 1
}

function emotionMatch(articleEmotions: string[], preferred: string[]): number {
  if (preferred.length === 0) return 1.0; // no preference = no penalty
  const match = articleEmotions.some((e) => preferred.includes(e));
  return match ? 1.3 : 0.85;
}

function localeMatch(articleLocale: string, preferred: string[]): number {
  if (preferred.length === 0 || preferred.includes("global")) return 1.0;
  if (preferred.includes(articleLocale) || articleLocale === "global") return 1.2;
  return 0.8;
}

function freshnessFactor(fetchedAt: string): number {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Linear decay: day 0 = 1.0, day 7 = 0.3
  return Math.max(0.3, 1.0 - ageDays * 0.1);
}

function noveltyPenalty(usedCount: number): number {
  // Articles seen by many users get gradually penalised
  if (usedCount < 10) return 1.0;
  if (usedCount < 50) return 0.85;
  return 0.6;
}

// ─── Category selection ───────────────────────────────────────────────────────

/**
 * Pick the category for a given section index based on the user's weights.
 * Uses weighted random selection so the feed reflects preferences over time.
 */
function pickCategory(profile: UserProfile, sectionIndex: number): Category {
  // Use sectionIndex as a deterministic seed so the same user gets
  // consistent ordering across page loads (not random on every scroll).
  const weights = profile.categoryWeights;
  const total = Object.values(weights).reduce((s, w) => s + w, 0);

  // Generate a pseudo-random value seeded by sectionIndex
  const seed = ((sectionIndex * 2654435761) >>> 0) / 4294967296;
  let cumulative = 0;
  const threshold = seed * total;

  for (const cat of CATEGORIES) {
    cumulative += weights[cat] ?? 0;
    if (cumulative >= threshold) return cat;
  }

  // Fallback — rotate deterministically
  return CATEGORIES[sectionIndex % CATEGORIES.length];
}
