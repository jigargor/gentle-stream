/**
 * GET /api/feed
 *
 * Primary feed endpoint. Serves articles from the DB via the ranker agent.
 * Falls back to live ingest only if the DB has no articles at all for the
 * requested category (cold start or depleted stock).
 *
 * Query params:
 *   userId       string  — required for personalisation
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

const ANONYMOUS_USER_ID = "anonymous";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const userId = searchParams.get("userId") || ANONYMOUS_USER_ID;
  const categoryParam = searchParams.get("category");
  const sectionIndex = parseInt(searchParams.get("sectionIndex") || "0", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "3", 10);

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
    });

    if (result.articles.length >= pageSize) {
      return NextResponse.json(result);
    }

    // ── 2. Cold start / stock depleted — run ingest synchronously ────────────
    console.log(
      `[/api/feed] Stock depleted for "${result.category}" — running live ingest`
    );

    const resolvedCategory = (result.category || category || CATEGORIES[sectionIndex % CATEGORIES.length]) as Category;
    await runIngestAgent(resolvedCategory);

    // Tag the new articles immediately so they're usable
    await runTaggerAgent(15);

    // Retry the ranked fetch with fresh articles
    const retryResult = await getRankedFeed({
      userId,
      category: resolvedCategory,
      sectionIndex,
      pageSize,
      markSeen: userId !== ANONYMOUS_USER_ID,
    });

    return NextResponse.json({
      ...retryResult,
      fromCache: false, // tell the client this was a live generation
    });
  } catch (error: unknown) {
    console.error("[/api/feed] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
