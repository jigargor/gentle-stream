import type { Category } from "./constants";

// ─── Raw shape returned by the ingest agent (LLM output) ─────────────────────
export interface RawArticle {
  headline: string;
  subheadline: string;
  byline: string;
  location: string;
  category: Category;
  body: string;
  pullQuote: string;
  imagePrompt: string;
  sourceUrls: string[];  // normalized URLs extracted from web search result blocks
}

// ─── Fully enriched article as stored in the database ────────────────────────
export interface StoredArticle extends RawArticle {
  id: string;
  fetchedAt: string;           // ISO timestamp
  expiresAt: string;           // ISO timestamp (fetchedAt + 7 days)

  // Written by tagger agent
  tags: string[];              // ["ocean", "coral", "australia"]
  sentiment: ArticleSentiment;
  emotions: string[];          // ["joy", "awe", "hope"]
  locale: string;              // "global" | "US" | "UK" | "AU" etc.
  readingTimeSecs: number;
  qualityScore: number;        // 0–1

  // Feed mechanics
  usedCount: number;           // how many feed responses included this article
  tagged: boolean;             // false until tagger agent has run
}

export type ArticleSentiment =
  | "uplifting"
  | "inspiring"
  | "heartwarming"
  | "triumphant";

// ─── User profile ─────────────────────────────────────────────────────────────

/** Reader vs future publisher (Substack-style). Only `general` is assignable from the app API. */
export type UserRole = "general" | "creator";

export interface UserProfile {
  userId: string;
  categoryWeights: Record<Category, number>; // must sum to ~1.0
  gameRatio: number;                          // 0.0–1.0, portion of feed that is games
  userRole: UserRole;
  displayName: string | null;
  username: string | null;
  /** When `username` was last set or changed; used for 24h rename cooldown. */
  usernameSetAt: string | null;
  avatarUrl: string | null;
  seenArticleIds: string[];
  preferredEmotions: string[];               // subset of ArticleSentiment emotions
  preferredLocales: string[];                // ["global", "US"] etc.
  createdAt: string;
  updatedAt: string;
}

/** Row from `article_saves` for library UI */
export interface SavedArticleListItem {
  id: string;
  articleId: string;
  articleTitle: string;
  articleUrl: string | null;
  summary: string | null;
  savedAt: string;
  isRead: boolean;
}

/** Per difficulty bucket within a game type (easy / medium / hard). */
export interface GameDifficultyBucketStats {
  completions: number;
  totalSeconds: number;
  avgSeconds: number;
}

/** Aggregated gaming metrics for profile + full stats page */
export interface UserGameStats {
  totalCompletions: number;
  totalSecondsPlayed: number;
  byType: Record<
    string,
    { completions: number; totalSeconds: number; avgSeconds: number }
  >;
  /** gameType → difficulty → counts (difficulty stored on each completion row) */
  byTypeAndDifficulty: Record<string, Record<string, GameDifficultyBucketStats>>;
  recent: Array<{
    gameType: string;
    difficulty: string;
    durationSeconds: number;
    completedAt: string;
  }>;
}

// ─── Feed API request / response ─────────────────────────────────────────────
export interface FeedRequest {
  userId: string;
  category?: Category | null;
  sectionIndex: number;
  pageSize?: number;           // default 3 (one newspaper section = 3 articles)
}

/** See `lib/feed/selection-types.ts` */
export type FeedSelectionMode =
  | "profile_ranked"
  | "random_pool"
  | "random_resurface";

export interface FeedResponse {
  articles: StoredArticle[];
  category: string;
  fromCache: boolean;          // true = served from DB, false = freshly generated
  /** How articles were chosen; omit = treat as profile_ranked (legacy clients) */
  selectionMode?: FeedSelectionMode;
}

// ─── Component / UI types ─────────────────────────────────────────────────────

// Article passed to UI components — either a stored article or a raw one (same fields used)
export type Article = StoredArticle | RawArticle;

export interface NewsSection {
  articles: Article[];
  index: number;
}

export type LayoutVariant = "hero" | "wide" | "standard";

// ─── Feed sections — articles or games ────────────────────────────────────────

export interface ArticleFeedSection {
  sectionType: "articles";
  articles: Article[];
  index: number;
}

export interface GameFeedSection {
  sectionType: "game";
  gameType: "sudoku" | "killer_sudoku" | "word_search" | "nonogram" | "crossword" | "connections" | "cryptic" | "lateral";
  difficulty: "easy" | "medium" | "hard";
  index: number;
  /** Article category of the preceding feed section — used for word bank theming */
  category?: string;
}

/** A single row in the infinite scroll feed — either articles or a game */
export type FeedSection = ArticleFeedSection | GameFeedSection;

// ─── Agent job payloads ───────────────────────────────────────────────────────
export interface IngestJobPayload {
  category: Category;
  count: number;               // how many articles to generate (default 10)
}

export interface TaggerJobPayload {
  articleId: string;
}
