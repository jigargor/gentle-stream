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
export const STOCK_THRESHOLD = 20;

/** How many articles the ingest agent produces per run */
export const INGEST_BATCH_SIZE = 6; // fetched 2 at a time

/** Articles expire after this many days */
export const ARTICLE_TTL_DAYS = 7;

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
