export const CATEGORIES = [
  "Science & Discovery",
  "Community Heroes",
  "Arts & Culture",
  "Environment & Nature",
  "Health & Wellness",
  "Innovation & Tech",
  "Human Kindness",
  "Education",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Storage-only feed bucket for `content_kind = recipe` rows — not a news topic label.
 * Recipes are not assigned editorial categories (Science & Discovery, etc.).
 */
export const RECIPE_CATEGORY = "recipe" as const;

export type ArticleStorageCategory = Category | typeof RECIPE_CATEGORY;

export const CATEGORY_COLORS: Record<Category, string> = {
  "Science & Discovery": "#1a472a",
  "Community Heroes": "#7b2d00",
  "Arts & Culture": "#2c1654",
  "Environment & Nature": "#1a3a2a",
  "Health & Wellness": "#002b3d",
  "Innovation & Tech": "#1a1a3e",
  "Human Kindness": "#3d0000",
  Education: "#2d2400",
};

export const LAYOUT_COUNT = 3;

// ─── Caching / stock thresholds ───────────────────────────────────────────────

/** Minimum unread articles per category before the scheduler triggers ingest */
export const STOCK_THRESHOLD = 30;

/** How many articles the ingest agent produces per run */
export const INGEST_BATCH_SIZE = 6; // fetched 1 at a time, token-aware

/** Soft target stock per category for cron top-ups (not a hard cap). */
export const STOCK_TARGET = 60;

/** Max articles to ingest per category in a single scheduler run. */
export const STOCK_TOP_UP_MAX_PER_RUN = 24;

/** If latest tagged article is older than this, ingest a freshness refill. */
export const FRESHNESS_INGEST_HOURS = 3;

/** Default number of articles to ingest when only staleness triggers refill. */
export const STALENESS_REFILL_COUNT = 2;

// ─── Default user profile ─────────────────────────────────────────────────────

/** Equal weights across all categories — used for anonymous / new users */
export const DEFAULT_CATEGORY_WEIGHTS: Record<Category, number> = {
  "Science & Discovery": 0.125,
  "Community Heroes": 0.125,
  "Arts & Culture": 0.125,
  "Environment & Nature": 0.125,
  "Health & Wellness": 0.125,
  "Innovation & Tech": 0.125,
  "Human Kindness": 0.125,
  Education: 0.125,
};

export const DEFAULT_GAME_RATIO = 0.2; // 20% games, 80% news
