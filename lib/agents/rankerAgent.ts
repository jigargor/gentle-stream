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
import {
  getOrCreateUserProfile,
  listSeenArticleIdsForExclusion,
  markArticlesSeen,
} from "../db/users";
import { getUserAffinityRows } from "../db/engagement";
import type {
  ArticleContentKind,
  FeedSelectionMode,
  StoredArticle,
  UserProfile,
} from "../types";
import type { Category } from "../constants";
import { CATEGORIES, DEFAULT_CATEGORY_WEIGHTS, RECIPE_CATEGORY } from "../constants";
import { buildAffinityIndex, scoreArticleWithEngagement } from "../feed/recommendationScore";
import { captureException } from "@/lib/observability";
import { getEnv } from "@/lib/env";
import pLimit from "p-limit";

/** Section label when articles come from multiple categories (random backfill). */
const MIXED_SECTION_LABEL = "Mixed";
const SOFT_SEEN_TTL_MS = 20 * 60 * 1000;
const RANDOM_FALLBACK_EXCLUDE_CAP = 240;
const rankerBucketLimit = pLimit(3);
const env = getEnv();
const hybridSeenEnabled =
  env.FEED_HYBRID_SEEN_ENABLED == null ? true : env.FEED_HYBRID_SEEN_ENABLED;

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
  contentKinds?: ArticleContentKind[] | null;
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

/**
 * Editorial categories for news + user articles, plus the `recipe` storage bucket when needed.
 */
function feedBucketsForTraversal(
  profile: UserProfile,
  sectionIndex: number,
  contentKinds?: ArticleContentKind[]
): (Category | typeof RECIPE_CATEGORY)[] {
  const onlyRecipe =
    contentKinds != null &&
    contentKinds.length === 1 &&
    contentKinds[0] === "recipe";
  if (onlyRecipe) return [RECIPE_CATEGORY];

  const base = orderedCategoriesForMixedFeed(profile, sectionIndex);
  const includeRecipe =
    contentKinds == null ||
    contentKinds.length === 0 ||
    contentKinds.includes("recipe");
  const includeNonRecipeKinds =
    contentKinds == null ||
    contentKinds.length === 0 ||
    contentKinds.some((k) => k !== "recipe");

  if (includeNonRecipeKinds && includeRecipe) return [...base, RECIPE_CATEGORY];
  if (includeNonRecipeKinds) return base;
  if (includeRecipe) return [RECIPE_CATEGORY];
  return base;
}

export async function collectAcrossBuckets(
  profile: UserProfile,
  userId: string,
  sectionIndex: number,
  poolSize: number,
  excludeIds: string[],
  contentKinds: ArticleContentKind[] | undefined,
  fetchFn: (
    category: Category | typeof RECIPE_CATEGORY,
    limit: number,
    excludeIds: string[],
    contentKinds: ArticleContentKind[] | undefined,
    userId: string
  ) => Promise<StoredArticle[]>,
  bucketOrderOverride?: (Category | typeof RECIPE_CATEGORY)[]
): Promise<StoredArticle[]> {
  const order =
    bucketOrderOverride && bucketOrderOverride.length > 0
      ? bucketOrderOverride
      : feedBucketsForTraversal(profile, sectionIndex, contentKinds);
  if (order.length === 0) return [];

  // Parallel per-bucket fetches: sequential awaits stacked latency across many categories.
  const perBucketLimit = Math.max(
    8,
    Math.ceil(poolSize / order.length) + 8
  );
  const batches = await Promise.all(
    order.map((cat) =>
      rankerBucketLimit(() =>
        fetchFn(cat, perBucketLimit, excludeIds, contentKinds, userId)
      )
    )
  );

  const collected: StoredArticle[] = [];
  const collectedIds = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    if (collected.length >= poolSize) break;
    const batch = batches[i] ?? [];
    for (const article of batch) {
      if (collectedIds.has(article.id)) continue;
      collectedIds.add(article.id);
      collected.push(article);
      if (collected.length >= poolSize) break;
    }
  }

  return collected;
}

function buildAffinityBucketOrder(
  profile: UserProfile,
  sectionIndex: number,
  contentKinds: ArticleContentKind[] | undefined,
  affinityIndex: Map<string, number>
): (Category | typeof RECIPE_CATEGORY)[] {
  const base = feedBucketsForTraversal(profile, sectionIndex, contentKinds);
  if (affinityIndex.size === 0) return base;

  const affinityByCategory = new Map<string, number>();
  for (const [key, score] of affinityIndex.entries()) {
    const [category] = key.split("|");
    if (!category) continue;
    const prev = affinityByCategory.get(category);
    if (prev == null || score > prev) affinityByCategory.set(category, score);
  }

  return [...base].sort((a, b) => {
    const aScore = affinityByCategory.get(a) ?? Number.NEGATIVE_INFINITY;
    const bScore = affinityByCategory.get(b) ?? Number.NEGATIVE_INFINITY;
    if (aScore === bScore) return 0;
    return bScore - aScore;
  });
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
  const startedAtMs = Date.now();
  const {
    userId,
    category,
    sectionIndex,
    pageSize = 3,
    markSeen = true,
    excludeArticleIds = [],
    contentKinds = null,
  } = options;

  const profile = await getOrCreateUserProfile(userId);
  const effectiveExcludeIds = Array.from(new Set(excludeArticleIds));
  let affinityIndex = new Map<string, number>();
  try {
    const affinityRows = await getUserAffinityRows(userId);
    affinityIndex = buildAffinityIndex(affinityRows);
  } catch (error) {
    console.warn("[rankerAgent] Failed loading user affinity rows:", error);
    captureException(error, { agent: "ranker", userId, phase: "load_affinity" });
  }
  // Future: build `FeedSelectionContext` from profile + engagement signals here.

  // Label for this section (single category when filtered; primary pick when mixed)
  const resolvedCategory = category ?? pickCategory(profile, sectionIndex);
  const affinityBucketOrder =
    category == null
      ? buildAffinityBucketOrder(
          profile,
          sectionIndex,
          contentKinds ?? undefined,
          affinityIndex
        )
      : undefined;

  // Fetch a candidate pool (fetch more than needed so we can rank and trim)
  const poolSize = pageSize * 5;
  let candidateQueryCount = 0;
  let candidates = category
    ? await (async () => {
        candidateQueryCount += 1;
        return getArticlesForFeed(
        category,
        poolSize,
        effectiveExcludeIds,
        contentKinds ?? undefined,
        userId
      );
      })()
    : await (async () => {
        candidateQueryCount += 1;
        return collectAcrossBuckets(
        profile,
        userId,
        sectionIndex,
        poolSize,
        effectiveExcludeIds,
        contentKinds ?? undefined,
        getArticlesForFeed,
        affinityBucketOrder
      );
      })();

  // If nothing is tagged yet (tagger backlog / 429), still show fresh ingested rows
  if (candidates.length === 0) {
    candidates = category
      ? await (async () => {
          candidateQueryCount += 1;
          return getUntaggedArticlesForFeed(
          category,
          poolSize,
          effectiveExcludeIds,
          contentKinds ?? undefined,
          userId
        );
        })()
      : await (async () => {
          candidateQueryCount += 1;
          return collectAcrossBuckets(
          profile,
          userId,
          sectionIndex,
          poolSize,
          effectiveExcludeIds,
          contentKinds ?? undefined,
          getUntaggedArticlesForFeed,
          affinityBucketOrder
        );
        })();
  }

  let selectionMode: FeedSelectionMode = "profile_ranked";
  let sectionCategoryLabel: string = resolvedCategory;
  /** False for random_pool / random_resurface — those paths must not re-sort by score */
  let rankByProfileScore = true;

  // No profile-based recommendations for this section — pull from the whole catalog
  if (candidates.length === 0) {
    const recentlySeen = hybridSeenEnabled
      ? await listSeenArticleIdsForExclusion({
          userId,
          limit: RANDOM_FALLBACK_EXCLUDE_CAP,
          softSeenSource: "ranker_soft",
          softSeenTtlMs: SOFT_SEEN_TTL_MS,
        })
      : await listSeenArticleIdsForExclusion({
          userId,
          limit: RANDOM_FALLBACK_EXCLUDE_CAP,
          softSeenSource: "__unused__",
          softSeenTtlMs: Number.MAX_SAFE_INTEGER,
        });
    const randomExcludeIds = Array.from(
      new Set([...effectiveExcludeIds, ...recentlySeen])
    ).slice(-RANDOM_FALLBACK_EXCLUDE_CAP);
    candidates = await getRandomAvailableArticles(
      poolSize,
      randomExcludeIds,
      contentKinds ?? undefined
    );
    candidateQueryCount += 1;
    if (candidates.length > 0) {
      selectionMode = "random_pool";
      sectionCategoryLabel = MIXED_SECTION_LABEL;
      rankByProfileScore = false;
    }
  }

  // Still empty (e.g. user has seen everything in the sampled pool) — allow repeats
  if (candidates.length === 0) {
    candidates = await getRandomArticlesResurfacing(poolSize, contentKinds ?? undefined);
    candidateQueryCount += 1;
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
    await markArticlesSeen(userId, selected.map((a) => a.id), {
      source: hybridSeenEnabled ? "ranker_soft" : "ranker",
      sectionIndex,
      trustArticleIds: true,
    });
  }

  console.info("[ranker-feed-metrics]", {
    userId,
    sectionIndex,
    pageSize,
    candidateQueryCount,
    selectedCount: selected.length,
    selectionMode,
    parallelBucketFetch: category == null,
    durationMs: Date.now() - startedAtMs,
  });

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
