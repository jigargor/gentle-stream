import {
  ARTICLE_ENGAGEMENT_EVENT_TYPES,
  type ArticleEngagementBatchRequest,
  type ArticleEngagementEventInput,
} from "@/lib/engagement/types";

export const ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidEventType(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ARTICLE_ENGAGEMENT_EVENT_TYPES.includes(
      value as (typeof ARTICLE_ENGAGEMENT_EVENT_TYPES)[number]
    )
  );
}

function normalizeOccurredAt(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return new Date().toISOString();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export interface NormalizedEngagementRow {
  user_id: string;
  article_id: string;
  event_type: (typeof ARTICLE_ENGAGEMENT_EVENT_TYPES)[number];
  event_value: number | null;
  session_id: string | null;
  occurred_at: string;
  context: Record<string, unknown>;
}

export interface ParseEngagementBatchResult {
  rows: NormalizedEngagementRow[];
  error: string | null;
}

export function parseEngagementBatch(
  body: ArticleEngagementBatchRequest | null,
  userId: string
): ParseEngagementBatchResult {
  const rawEvents = Array.isArray(body?.events) ? body.events : null;
  if (!rawEvents || rawEvents.length === 0) {
    return { rows: [], error: "events[] required" };
  }
  if (rawEvents.length > ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST) {
    return {
      rows: [],
      error: `events[] exceeds max size (${ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST})`,
    };
  }

  const rows = rawEvents
    .map((event) => normalizeOneEvent(event, userId))
    .filter((row): row is NormalizedEngagementRow => row !== null);

  if (rows.length === 0) {
    return { rows: [], error: "No valid events" };
  }
  return { rows, error: null };
}

function normalizeOneEvent(
  event: ArticleEngagementEventInput,
  userId: string
): NormalizedEngagementRow | null {
  if (!event || typeof event !== "object") return null;
  if (typeof event.articleId !== "string" || !UUID_RE.test(event.articleId)) {
    return null;
  }
  if (!isValidEventType(event.eventType)) return null;

  const context = isObject(event.context) ? event.context : {};
  return {
    user_id: userId,
    article_id: event.articleId,
    event_type: event.eventType,
    event_value:
      typeof event.eventValue === "number" && Number.isFinite(event.eventValue)
        ? event.eventValue
        : null,
    session_id:
      typeof event.sessionId === "string" && event.sessionId.trim().length > 0
        ? event.sessionId.trim()
        : null,
    occurred_at: normalizeOccurredAt(event.occurredAt),
    context,
  };
}

