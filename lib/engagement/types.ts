export const ARTICLE_ENGAGEMENT_EVENT_TYPES = [
  "impression",
  "open",
  "click_through",
  "scroll_depth",
  "read_30s",
  "read_75pct",
  "read_dwell",
  "like",
  "save",
  "share",
] as const;

export type ArticleEngagementEventType =
  (typeof ARTICLE_ENGAGEMENT_EVENT_TYPES)[number];

export interface ArticleEngagementContext {
  source?: "feed" | "saved" | "search" | "direct" | "unknown";
  sectionIndex?: number;
  cardIndex?: number;
  seq?: number;
  scrollDepth?: number;
  gameNeighbor?: string | null;
  locale?: string | null;
  userAgent?: string | null;
}

/**
 * Client payload contract for POST /api/user/article-engagement.
 * Send batched events to reduce request overhead.
 */
export interface ArticleEngagementEventInput {
  articleId: string;
  eventType: ArticleEngagementEventType;
  eventValue?: number | null;
  sessionId?: string | null;
  occurredAt?: string | null; // ISO timestamp; defaults to server now
  context?: ArticleEngagementContext | null;
}

export interface ArticleEngagementBatchRequest {
  events: ArticleEngagementEventInput[];
}

export interface ArticleEngagementBatchResponse {
  ok: true;
  accepted: number;
}

