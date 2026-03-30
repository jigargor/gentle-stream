/**
 * GET /api/feed
 *
 * Primary feed endpoint. Serves articles from the DB via the ranker agent.
 * Falls back to live ingest only when the DB returns **zero** articles for this
 * request. If we have 1..pageSize-1 (e.g. only 2 unseen left), we return them
 * immediately so the client never blocks on a multi-minute synchronous ingest.
 *
 * Query params:
 *   category     string  — optional; omit to let the ranker pick
 *   contentKind  string  — optional; one of news|user_article|recipe
 *   contentKinds string  — optional csv override of content kinds
 *   sectionIndex number  — position in the infinite scroll feed
 *   pageSize     number  — articles per section (default 3)
 */

import { NextRequest, NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { ArticleContentKind } from "@/lib/types";
import { getRankedFeed } from "@/lib/agents/rankerAgent";
import { runIngestAgent } from "@/lib/agents/ingestAgent";
import { runTaggerAgent } from "@/lib/agents/taggerAgent";
import {
  appendCronIngestCategoryLogs,
  createCronIngestRun,
  finishCronIngestRun,
} from "@/lib/db/cronIngestLogs";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const ANONYMOUS_USER_ID = "anonymous";

function isDevLight(): boolean {
  const v = process.env.DEV_LIGHT;
  return v === "1" || v === "true";
}

function parseContentKinds(searchParams: URLSearchParams): ArticleContentKind[] | null {
  const single = searchParams.get("contentKind");
  const multi = searchParams.get("contentKinds");
  const raw = `${single ?? ""},${multi ?? ""}`
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (raw.length === 0) return null;
  const allowed = raw.filter(
    (v): v is ArticleContentKind =>
      v === "news" || v === "user_article" || v === "recipe"
  );
  return allowed.length > 0 ? Array.from(new Set(allowed)) : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const sessionUserId = process.env.AUTH_DISABLED === "1" ? null : await getSessionUserId();
  const userId =
    process.env.AUTH_DISABLED === "1"
      ? process.env.DEV_USER_ID ?? "dev-local"
      : sessionUserId || ANONYMOUS_USER_ID;

  const rateLimit = consumeRateLimit({
    policy:
      userId === ANONYMOUS_USER_ID
        ? { id: "feed-anon", windowMs: 60_000, max: 45 }
        : { id: "feed-auth", windowMs: 60_000, max: 180 },
    key: buildRateLimitKey({
      request,
      userId: userId === ANONYMOUS_USER_ID ? null : userId,
      routeId: "api-feed",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const categoryParam = searchParams.get("category");
  const contentKinds = parseContentKinds(searchParams);
  const sectionIndex = parseInt(searchParams.get("sectionIndex") || "0", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "3", 10);
  const excludeIdsParam = searchParams.get("excludeIds") || "";
  const excludeArticleIds = excludeIdsParam
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const category =
    categoryParam && CATEGORIES.includes(categoryParam as Category)
      ? (categoryParam as Category)
      : null;

  try {
    // ── 1. Try to serve from the DB ──────────────────────────────────────────
    const result = await getRankedFeed({
      userId,
      category,
      sectionIndex,
      pageSize,
      markSeen: userId !== ANONYMOUS_USER_ID,
      excludeArticleIds,
      contentKinds,
    });

    if (result.articles.length >= pageSize) {
      return NextResponse.json(result);
    }

    // Partial page: serve what we have — do not block the UI on live ingest
    if (result.articles.length > 0) {
      return NextResponse.json(result);
    }

    // `npm run dev-light` sets DEV_LIGHT=1 — never run ingest/tagger from this route
    if (isDevLight()) {
      console.log(
        `[/api/feed] DEV_LIGHT: skipping live ingest (no rows for "${result.category}")`
      );
      return NextResponse.json(result);
    }

    const canIngestNews = !contentKinds || contentKinds.includes("news");
    if (!canIngestNews) {
      return NextResponse.json(result);
    }

    // ── 2. True cold start (zero articles) — refill with a *small* ingest ────
    console.log(
      `[/api/feed] No articles for this request ("${result.category}") — running live ingest`
    );

    const resolvedCategory = (result.category || category || CATEGORIES[sectionIndex % CATEGORIES.length]) as Category;
    // Default ingest agent pulls 6 articles; that can take many minutes under rate limits.
    // Only fetch enough to satisfy this one section (+ small buffer for tagging misses).
    const ingestCount = Math.min(pageSize + 2, 6);
    let runId: string | null = null;
    try {
      runId = await createCronIngestRun("feed-cold-start");
    } catch (error) {
      console.warn("[/api/feed] Could not create cold-start ingest log run:", error);
    }
    let ingestResult: Awaited<ReturnType<typeof runIngestAgent>> | null = null;
    let coldStartError: string | null = null;
    try {
      ingestResult = await runIngestAgent(resolvedCategory, ingestCount);
      await runTaggerAgent(Math.min(20, ingestCount + 5));

      if (runId) {
        try {
          await appendCronIngestCategoryLogs(runId, [
            {
              category: resolvedCategory,
              beforeCount: 0,
              requestedCount: ingestCount,
              insertedCount: ingestResult.inserted.length,
              attemptedCount: ingestResult.attemptedCount,
              skippedCount: ingestResult.skippedCount,
              failedCount: ingestResult.failedCount,
              retryCount: ingestResult.retryCount,
              durationMs: ingestResult.durationMs,
              warningFlag:
                ingestResult.failedCount > 0 || ingestResult.inserted.length === 0,
              reason: "threshold",
              newestFetchedAt: null,
              errorSummary: ingestResult.errorSummary ?? undefined,
            },
          ]);

          await finishCronIngestRun(runId, {
            ok: true,
            totalInserted: ingestResult.inserted.length,
            totalAttempted: ingestResult.attemptedCount,
            totalSkipped: ingestResult.skippedCount,
            totalFailed: ingestResult.failedCount,
            totalRetried: ingestResult.retryCount,
            warningCount:
              ingestResult.failedCount > 0 || ingestResult.inserted.length === 0 ? 1 : 0,
            errorSummary: ingestResult.errorSummary ?? undefined,
            categoriesChecked: 1,
            notes: `trigger=feed-cold-start; category=${resolvedCategory}`,
          });
        } catch (logError) {
          console.warn("[/api/feed] Could not persist cold-start ingest logs:", logError);
        }
      }
    } catch (error: unknown) {
      coldStartError = error instanceof Error ? error.message : "Unknown ingest error";
      if (runId) {
        try {
          await finishCronIngestRun(runId, {
            ok: false,
            totalInserted: ingestResult?.inserted.length ?? 0,
            totalAttempted: ingestResult?.attemptedCount ?? ingestCount,
            totalSkipped: ingestResult?.skippedCount ?? 0,
            totalFailed: ingestResult?.failedCount ?? ingestCount,
            totalRetried: ingestResult?.retryCount ?? 0,
            warningCount: 1,
            errorSummary: coldStartError,
            categoriesChecked: 1,
            notes: `trigger=feed-cold-start; category=${resolvedCategory}`,
          });
        } catch (logError) {
          console.warn("[/api/feed] Could not finalize cold-start ingest log:", logError);
        }
      }
      throw error;
    }

    // Retry the ranked fetch with fresh articles (preserve mixed vs filtered)
    const retryResult = await getRankedFeed({
      userId,
      category,
      sectionIndex,
      pageSize,
      markSeen: userId !== ANONYMOUS_USER_ID,
      excludeArticleIds,
      contentKinds,
    });

    return NextResponse.json({
      ...retryResult,
      fromCache: false, // tell the client this was a live generation
    });
  } catch (error: unknown) {
    console.error("[/api/feed] Error:", error);
    return NextResponse.json(
      { error: "Could not load feed right now." },
      { status: 500 }
    );
  }
}
