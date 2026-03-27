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

import {
  getArticlesForFeed,
  getRandomArticlesResurfacing,
  getRandomAvailableArticles,
  getUntaggedArticlesForFeed,
} from "../db/articles";
import { getOrCreateUserProfile, markArticlesSeen } from "../db/users";
import { getUserAffinityRows } from "../db/engagement";
import type {
  FeedSelectionMode,
  StoredArticle,
  UserProfile,
} from "../types";
import type { Category } from "../constants";
import { CATEGORIES, DEFAULT_CATEGORY_WEIGHTS } from "../constants";
import { buildAffinityIndex, scoreArticleWithEngagement } from "../feed/recommendationScore";

/** Section label when articles come from multiple categories (random backfill). */
const MIXED_SECTION_LABEL = "Mixed";

export interface RankedFeedResult {
  articles: StoredArticle[];
  fromCache: true;
  category: string;
  selectionMode: FeedSelectionMode;
}

interface RankOptions {
  userId: string;
  category?: Category | null;   // null = rotate through weighted categories
  sectionIndex: number;
  pageSize?: number;             // articles per section (default 3)
  markSeen?: boolean;            // default true
  excludeArticleIds?: string[];  // force uniqueness against already-rendered feed items
}

/**
 * When no category filter is set, walk categories in a deterministic order
 * (primary pick first, then rotated remainder) so each scroll can surface
 * stories from the whole catalog, not only from one weighted pick.
 */
function orderedCategoriesForMixedFeed(
  profile: UserProfile,
  sectionIndex: number
): Category[] {
  const primary = pickCategory(profile, sectionIndex);
  const rest = CATEGORIES.filter((c) => c !== primary);
  const offset = sectionIndex % Math.max(rest.length, 1);
  const rotated =
    rest.length === 0
      ? []
      : [...rest.slice(offset), ...rest.slice(0, offset)];
  return [primary, ...rotated];
}

async function collectCandidatesAcrossCategories(
  profile: UserProfile,
  sectionIndex: number,
  poolSize: number,
  excludeIds: string[]
): Promise<StoredArticle[]> {
  const order = orderedCategoriesForMixedFeed(profile, sectionIndex);
  const collected: StoredArticle[] = [];
  const collectedIds = new Set<string>();

  for (const cat of order) {
    if (collected.length >= poolSize) break;
    const remaining = poolSize - collected.length;
    const batch = await getArticlesForFeed(
      cat,
      remaining + 8,
      excludeIds
    );
    for (const article of batch) {
      if (collectedIds.has(article.id)) continue;
      collectedIds.add(article.id);
      collected.push(article);
      if (collected.length >= poolSize) break;
    }
  }

  return collected;
}

async function collectUntaggedAcrossCategories(
  profile: UserProfile,
  sectionIndex: number,
  poolSize: number,
  excludeIds: string[]
): Promise<StoredArticle[]> {
  const order = orderedCategoriesForMixedFeed(profile, sectionIndex);
  const collected: StoredArticle[] = [];
  const collectedIds = new Set<string>();

  for (const cat of order) {
    if (collected.length >= poolSize) break;
    const remaining = poolSize - collected.length;
    const batch = await getUntaggedArticlesForFeed(
      cat,
      remaining + 8,
      excludeIds
    );
    for (const article of batch) {
      if (collectedIds.has(article.id)) continue;
      collectedIds.add(article.id);
      collected.push(article);
      if (collected.length >= poolSize) break;
    }
  }

  return collected;
}

/**
 * When we intentionally sample randomly, score-based sorting would always surface
 * the same few highest-quality IDs. Rotate by sectionIndex so infinite scroll varies.
 */
function pickRotatedPage(
  candidates: StoredArticle[],
  sectionIndex: number,
  pageSize: number
): StoredArticle[] {
  const n = candidates.length;
  if (n === 0) return [];

  const start =
    n <= pageSize
      ? sectionIndex % n
      : (sectionIndex * pageSize) % n;

  const out: StoredArticle[] = [];
  for (let i = 0; i < pageSize; i++) {
    out.push(candidates[(start + i) % n]!);
  }
  return out;
}

/**
 * Main entry point. Returns a ranked page of articles for a user.
 *
 * Selection pipeline (see `lib/feed/README.md` for future engagement hooks):
 *   1) Profile-weighted category picks → tagged → untagged per category
 *   2) Random pool across all unexpired (still excluding seen)
 *   3) Random resurfacing (ignore seen) if the DB has rows but none unseen in sample
 */
export async function getRankedFeed(
  options: RankOptions
): Promise<RankedFeedResult> {
  const {
    userId,
    category,
    sectionIndex,
    pageSize = 3,
    markSeen = true,
    excludeArticleIds = [],
  } = options;

  const profile = await getOrCreateUserProfile(userId);
  const effectiveExcludeIds = Array.from(
    new Set([...profile.seenArticleIds, ...excludeArticleIds])
  );
  let affinityIndex = new Map<string, number>();
  try {
    const affinityRows = await getUserAffinityRows(userId);
    affinityIndex = buildAffinityIndex(affinityRows);
  } catch (error) {
    console.warn("[rankerAgent] Failed loading user affinity rows:", error);
  }
  // Future: build `FeedSelectionContext` from profile + engagement signals here.

  // Label for this section (single category when filtered; primary pick when mixed)
  const resolvedCategory = category ?? pickCategory(profile, sectionIndex);

  // Fetch a candidate pool (fetch more than needed so we can rank and trim)
  const poolSize = pageSize * 5;
  let candidates = category
    ? await getArticlesForFeed(category, poolSize, effectiveExcludeIds)
    : await collectCandidatesAcrossCategories(
        profile,
        sectionIndex,
        poolSize,
        effectiveExcludeIds
      );

  // If nothing is tagged yet (tagger backlog / 429), still show fresh ingested rows
  if (candidates.length === 0) {
    candidates = category
      ? await getUntaggedArticlesForFeed(
          category,
          poolSize,
          effectiveExcludeIds
        )
      : await collectUntaggedAcrossCategories(
          profile,
          sectionIndex,
          poolSize,
          effectiveExcludeIds
        );
  }

  let selectionMode: FeedSelectionMode = "profile_ranked";
  let sectionCategoryLabel: string = resolvedCategory;
  /** False for random_pool / random_resurface — those paths must not re-sort by score */
  let rankByProfileScore = true;

  // No profile-based recommendations for this section — pull from the whole catalog
  if (candidates.length === 0) {
    candidates = await getRandomAvailableArticles(
      poolSize,
      effectiveExcludeIds
    );
    if (candidates.length > 0) {
      selectionMode = "random_pool";
      sectionCategoryLabel = MIXED_SECTION_LABEL;
      rankByProfileScore = false;
    }
  }

  // Still empty (e.g. user has seen everything in the sampled pool) — allow repeats
  if (candidates.length === 0) {
    candidates = await getRandomArticlesResurfacing(poolSize);
    if (candidates.length > 0) {
      selectionMode = "random_resurface";
      sectionCategoryLabel = MIXED_SECTION_LABEL;
      rankByProfileScore = false;
    }
  }

  const selected =
    candidates.length === 0
      ? []
      : rankByProfileScore
        ? (() => {
            const scored = candidates.map((a) => ({
              article: a,
              score: scoreArticleWithEngagement(a, profile, affinityIndex),
            }));
            scored.sort((a, b) => b.score - a.score);
            const out: StoredArticle[] = [];
            const chosenIds = new Set<string>();
            for (const entry of scored) {
              if (chosenIds.has(entry.article.id)) continue;
              chosenIds.add(entry.article.id);
              out.push(entry.article);
              if (out.length >= pageSize) break;
            }
            return out;
          })()
        : pickRotatedPage(candidates, sectionIndex, pageSize);

  // Mark as seen so they don't repeat in this user's feed
  if (markSeen && selected.length > 0) {
    await markArticlesSeen(userId, selected.map((a) => a.id));
  }

  return {
    articles: selected,
    fromCache: true,
    category: sectionCategoryLabel,
    selectionMode,
  };
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
