import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  ARTICLE_ENGAGEMENT_EVENT_TYPES,
  type ArticleEngagementBatchRequest,
  type ArticleEngagementEventInput,
} from "@/lib/engagement/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENTS_PER_REQUEST = 100;

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

function normalizeEvent(
  event: ArticleEngagementEventInput,
  userId: string
): Record<string, unknown> | null {
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

/**
 * Engagement tracking is now rolled out to 100% of authenticated users.
 */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ArticleEngagementBatchRequest | null = null;
  try {
    body = (await request.json()) as ArticleEngagementBatchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEvents = Array.isArray(body?.events) ? body.events : null;
  if (!rawEvents || rawEvents.length === 0) {
    return NextResponse.json({ error: "events[] required" }, { status: 400 });
  }
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    return NextResponse.json(
      { error: `events[] exceeds max size (${MAX_EVENTS_PER_REQUEST})` },
      { status: 400 }
    );
  }

  const rows = rawEvents
    .map((event) => normalizeEvent(event, userId))
    .filter((row): row is Record<string, unknown> => row !== null);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid events" }, { status: 400 });
  }

  const { error } = await db.from("article_engagement_events").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accepted: rows.length });
}

