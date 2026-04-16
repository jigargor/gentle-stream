import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { markArticlesSeen } from "@/lib/db/users";
import { getEnv } from "@/lib/env";
import { getSessionUserId } from "@/lib/api/sessionUser";
import type { ArticleEngagementBatchRequest } from "@/lib/engagement/types";
import {
  ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST,
  type NormalizedEngagementRow,
  parseEngagementBatch,
} from "@/lib/engagement/contract";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const env = getEnv();
const isServerBatchEnabled =
  env.ENGAGEMENT_SERVER_BATCH_ENABLED == null ? false : env.ENGAGEMENT_SERVER_BATCH_ENABLED;
const hybridSeenEnabled =
  env.FEED_HYBRID_SEEN_ENABLED == null ? true : env.FEED_HYBRID_SEEN_ENABLED;
const ENGAGEMENT_BUFFER_WINDOW_MS = 1_500;
const ENGAGEMENT_BUFFER_FLUSH_SIZE = 240;
const ENGAGEMENT_BUFFER_MAX_ROWS = 2_000;

function makeRequestId(request: NextRequest): string {
  const fromHeader = request.headers.get("x-request-id")?.trim();
  if (fromHeader) return fromHeader.slice(0, 64);
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `eng-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function filterRowsByExistingArticles(
  rows: NormalizedEngagementRow[]
): Promise<NormalizedEngagementRow[]> {
  const articleIds = Array.from(new Set(rows.map((row) => row.article_id)));
  if (articleIds.length === 0) return [];
  const { data, error } = await db
    .from("articles")
    .select("id")
    .in("id", articleIds);
  if (error) throw new Error(`filterRowsByExistingArticles: ${error.message}`);
  const existingIds = new Set((data ?? []).map((row) => String((row as { id: string }).id)));
  return rows.filter((row) => existingIds.has(row.article_id));
}

interface EngagementBufferState {
  queue: NormalizedEngagementRow[];
  timer: ReturnType<typeof setTimeout> | null;
  flushPromise: Promise<void> | null;
}

function getEngagementBufferState(): EngagementBufferState {
  const g = globalThis as typeof globalThis & {
    __gentleStreamEngagementBuffer?: EngagementBufferState;
  };
  if (!g.__gentleStreamEngagementBuffer) {
    g.__gentleStreamEngagementBuffer = {
      queue: [],
      timer: null,
      flushPromise: null,
    };
  }
  return g.__gentleStreamEngagementBuffer;
}

function enqueueEngagementRows(rows: NormalizedEngagementRow[]): number {
  const state = getEngagementBufferState();
  state.queue.push(...rows);
  if (state.queue.length > ENGAGEMENT_BUFFER_MAX_ROWS) {
    state.queue = state.queue.slice(-ENGAGEMENT_BUFFER_MAX_ROWS);
  }
  return state.queue.length;
}

async function flushEngagementBuffer(reason: string): Promise<void> {
  const state = getEngagementBufferState();
  if (state.flushPromise) return state.flushPromise;
  if (state.timer != null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const batch = state.queue.splice(0, Math.min(state.queue.length, ENGAGEMENT_BUFFER_MAX_ROWS));
  state.flushPromise = (async () => {
    try {
      let rowsToInsert = batch;
      let { error } = await db.from("article_engagement_events").insert(rowsToInsert);
      if (error && isArticleForeignKeyError(error.message)) {
        const validRows = await filterRowsByExistingArticles(batch);
        rowsToInsert = validRows;
        if (validRows.length > 0) {
          const retry = await db.from("article_engagement_events").insert(validRows);
          error = retry.error;
        } else {
          error = null;
        }
      }
      if (error) {
        console.error("[/api/user/article-engagement] buffered flush failed", {
          reason,
          message: error.message,
          batchSize: batch.length,
        });
        // Keep a small tail for best-effort retry on next flush.
        const retryTail = batch.slice(-Math.min(200, batch.length));
        state.queue = [...retryTail, ...state.queue].slice(-ENGAGEMENT_BUFFER_MAX_ROWS);
      }
    } finally {
      state.flushPromise = null;
    }
  })();
  await state.flushPromise;
}

function scheduleEngagementBufferFlush(): void {
  const state = getEngagementBufferState();
  if (state.timer != null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const timer = setTimeout(() => {
    state.timer = null;
    void flushEngagementBuffer("timer");
  }, ENGAGEMENT_BUFFER_WINDOW_MS);
  if (typeof timer === "object" && timer != null && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
  state.timer = timer;
}

function isArticleForeignKeyError(message: string): boolean {
  return (
    message.includes("foreign key constraint") &&
    (message.includes("article_id") || message.includes("articles"))
  );
}

/**
 * Engagement tracking is now rolled out to 100% of authenticated users.
 */
export async function POST(request: NextRequest) {
  const requestId = makeRequestId(request);
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const rateLimit = await consumeRateLimit({
    policy: { id: "article-engagement", windowMs: 60_000, max: 180 },
    key: buildRateLimitKey({
      request,
      userId,
      routeId: "api-user-article-engagement",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

  const parsedBody = await parseJsonBody({
    request,
    schema: z.object({
      events: z
        .array(z.unknown())
        .min(1)
        .max(ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST),
    }),
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as ArticleEngagementBatchRequest;

  const parsed = parseEngagementBatch(body, userId);
  if (parsed.error) {
    console.warn("[/api/user/article-engagement] invalid payload", {
      requestId,
      userId,
      reason: parsed.error,
      submittedEventCount: body.events?.length ?? 0,
    });
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: parsed.error,
    });
  }

  let rowsToInsert = parsed.rows;
  let droppedMissingArticleCount = 0;
  let bufferedQueueSize = 0;
  if (isServerBatchEnabled) {
    const queuedSize = enqueueEngagementRows(parsed.rows);
    bufferedQueueSize = queuedSize;
    if (queuedSize >= ENGAGEMENT_BUFFER_FLUSH_SIZE) await flushEngagementBuffer("size");
    else scheduleEngagementBufferFlush();
  } else {
    let { error } = await db.from("article_engagement_events").insert(rowsToInsert);
    if (error && isArticleForeignKeyError(error.message)) {
      console.warn("[/api/user/article-engagement] FK error on insert; filtering and retrying", {
        requestId,
        userId,
        message: error.message,
        parsedRows: parsed.rows.length,
      });
      const validRows = await filterRowsByExistingArticles(parsed.rows);
      droppedMissingArticleCount = parsed.rows.length - validRows.length;
      if (validRows.length === 0) {
        return NextResponse.json({
          ok: true,
          accepted: 0,
          droppedMissingArticleCount,
        });
      }
      rowsToInsert = validRows;
      const retry = await db.from("article_engagement_events").insert(validRows);
      error = retry.error;
    }

    if (error) {
      console.error("[/api/user/article-engagement] insert failed", {
        requestId,
        userId,
        message: error.message,
        parsedRows: parsed.rows.length,
        attemptedRows: rowsToInsert.length,
        droppedMissingArticleCount,
      });
      return apiErrorResponse({
        request,
        status: 500,
        code: API_ERROR_CODES.INTERNAL,
        message: "Could not record engagement right now.",
      });
    }
  }

  if (hybridSeenEnabled) {
    const hardSeenEventTypes = new Set(["click_through", "read_confirmed", "read_dwell"]);
    const hardSeenArticleIds = Array.from(
      new Set(
        rowsToInsert
          .filter((row) => hardSeenEventTypes.has(row.event_type))
          .map((row) => row.article_id)
          .filter(Boolean)
      )
    );
    if (hardSeenArticleIds.length > 0) {
      try {
        await markArticlesSeen(userId, hardSeenArticleIds, {
          source: "engagement_read",
          sectionIndex: null,
          trustArticleIds: true,
        });
      } catch (seenError) {
        const message = seenError instanceof Error ? seenError.message : String(seenError);
        console.warn("[/api/user/article-engagement] hard-seen write failed", {
          requestId,
          userId,
          hardSeenCount: hardSeenArticleIds.length,
          message,
        });
      }
    }
  }

  console.info("[/api/user/article-engagement] accepted", {
    requestId,
    userId,
    submittedRows: parsed.rows.length,
    acceptedRows: parsed.rows.length,
    droppedMissingArticleCount,
    buffered: isServerBatchEnabled,
    bufferedQueueSize,
  });

  return NextResponse.json({
    ok: true,
    accepted: parsed.rows.length,
    droppedMissingArticleCount,
    buffered: isServerBatchEnabled,
    bufferedQueueSize,
  });
}

