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
 *   sectionIndex number  — position in the infinite scroll feed
 *   pageSize     number  — articles per section (default 3)
 */

import { NextRequest, NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import { getRankedFeed } from "@/lib/agents/rankerAgent";
import { runIngestAgent } from "@/lib/agents/ingestAgent";
import { runTaggerAgent } from "@/lib/agents/taggerAgent";
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

    // ── 2. True cold start (zero articles) — refill with a *small* ingest ────
    console.log(
      `[/api/feed] No articles for this request ("${result.category}") — running live ingest`
    );

    const resolvedCategory = (result.category || category || CATEGORIES[sectionIndex % CATEGORIES.length]) as Category;
    // Default ingest agent pulls 6 articles; that can take many minutes under rate limits.
    // Only fetch enough to satisfy this one section (+ small buffer for tagging misses).
    const ingestCount = Math.min(pageSize + 2, 6);
    await runIngestAgent(resolvedCategory, ingestCount);

    // Tag enough to cover what we just inserted (ingest is 1 row per article)
    await runTaggerAgent(Math.min(20, ingestCount + 5));

    // Retry the ranked fetch with fresh articles (preserve mixed vs filtered)
    const retryResult = await getRankedFeed({
      userId,
      category,
      sectionIndex,
      pageSize,
      markSeen: userId !== ANONYMOUS_USER_ID,
      excludeArticleIds,
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
