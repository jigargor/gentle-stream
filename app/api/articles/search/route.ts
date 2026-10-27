import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { rowToArticle } from "@/lib/db/articles";
import type { ArticleContentKind, StoredArticle } from "@gentle-stream/domain/types";
import { CATEGORIES } from "@gentle-stream/domain/constants";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import {
  API_ERROR_CODES,
  apiErrorResponse,
  internalErrorResponse,
} from "@/lib/api/errors";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

function parsePositiveInt(value: string | null, fallbackValue: number): number {
  if (!value) return fallbackValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackValue;
  return parsed;
}

function parseContentKinds(input: string | null): ArticleContentKind[] | null {
  if (!input) return null;
  const raw = input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const kinds = raw.filter(
    (value): value is ArticleContentKind =>
      value === "news" || value === "user_article" || value === "recipe"
  );
  if (kinds.length === 0) return null;
  return Array.from(new Set(kinds));
}

function normalizeSearchTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .split(/[\s,#]+/)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 2)
    )
  ).slice(0, 8);
}

function scoreSearchResult(article: StoredArticle, tokens: string[]): number {
  const headline = (article.headline ?? "").toLowerCase();
  const body = (article.body ?? "").toLowerCase();
  const subheadline = (article.subheadline ?? "").toLowerCase();
  const tags = (article.tags ?? []).map((value) => value.toLowerCase());
  const explicitTags = (article.creatorExplicitTags ?? []).map((value) =>
    value.toLowerCase()
  );
  let score = 0;
  for (const token of tokens) {
    if (headline.includes(token)) score += 8;
    if (subheadline.includes(token)) score += 5;
    if (tags.some((tag) => tag.includes(token))) score += 6;
    if (explicitTags.some((tag) => tag.includes(token))) score += 7;
    if (body.includes(token)) score += 2;
  }
  return score + Math.min(3, article.qualityScore ?? 0);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Query must be at least 2 characters.",
      });
    }

    const sessionUserId = process.env.AUTH_DISABLED === "1" ? null : await getSessionUserId();
    const userId =
      process.env.AUTH_DISABLED === "1"
        ? process.env.DEV_USER_ID ?? "dev-local"
        : sessionUserId ?? "anonymous";

    const rateLimit = await consumeRateLimit({
      policy:
        userId === "anonymous"
          ? { id: "search-anon", windowMs: 60_000, max: 40 }
          : { id: "search-auth", windowMs: 60_000, max: 120 },
      key: buildRateLimitKey({
        request,
        userId: userId === "anonymous" ? null : userId,
        routeId: "api-articles-search",
      }),
    });
    if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

    const categoryParam = searchParams.get("category");
    const category =
      categoryParam && CATEGORIES.includes(categoryParam as (typeof CATEGORIES)[number])
        ? categoryParam
        : null;
    const contentKinds = parseContentKinds(searchParams.get("contentKinds"));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT))
    );
    const offset = parsePositiveInt(searchParams.get("offset"), 0);
    const tokens = normalizeSearchTokens(q);

    // Prefer search_tsv FTS (migration 064). Fall back to headline/subheadline
    // ilike (trigram) when the generated column is not yet applied.
    const escaped = q.replace(/[%_]/g, "").slice(0, 120);
    const ftsQuery = tokens.join(" ").slice(0, 120);
    const candidateLimit = Math.min(160, limit * 8);

    function buildBaseQuery(includeModeration: boolean) {
      let next = db
        .from("articles")
        .select("*")
        .eq("tagged", true)
        .is("deleted_at", null)
        .order("fetched_at", { ascending: false })
        .limit(candidateLimit);
      if (includeModeration) next = next.eq("moderation_status", "approved");
      if (category) next = next.eq("category", category);
      if (contentKinds && contentKinds.length > 0) next = next.in("content_kind", contentKinds);
      return next;
    }

    let { data, error } = await buildBaseQuery(true).textSearch("search_tsv", ftsQuery, {
      type: "plain",
      config: "english",
    });
    const missingSearchTsv =
      Boolean(error?.message) &&
      (error!.message.includes("search_tsv") ||
        error!.message.includes("column") ||
        error!.message.includes("textSearch"));
    if (error && error.message.includes("moderation_status")) {
      const fallback = await buildBaseQuery(false).textSearch("search_tsv", ftsQuery, {
        type: "plain",
        config: "english",
      });
      data = fallback.data;
      error = fallback.error;
    }
    if (error && (missingSearchTsv || error.message.includes("search_tsv"))) {
      let ilikeQuery = buildBaseQuery(true).or(
        `headline.ilike.%${escaped}%,subheadline.ilike.%${escaped}%`
      );
      let ilikeResult = await ilikeQuery;
      if (ilikeResult.error && ilikeResult.error.message.includes("moderation_status")) {
        ilikeResult = await buildBaseQuery(false).or(
          `headline.ilike.%${escaped}%,subheadline.ilike.%${escaped}%`
        );
      }
      data = ilikeResult.data;
      error = ilikeResult.error;
    }
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Parameters<typeof rowToArticle>[0][];
    const ranked = rows
      .map((row) => rowToArticle(row))
      .map((article) => ({
        article,
        score: scoreSearchResult(article, tokens),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const page = ranked.slice(offset, offset + limit).map((entry) => entry.article);

    return NextResponse.json({
      query: q,
      offset,
      limit,
      total: ranked.length,
      hasMore: offset + limit < ranked.length,
      articles: page,
    });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
