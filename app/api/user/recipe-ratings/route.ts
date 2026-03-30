import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody, parseQuery } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const querySchema = z.object({ articleId: z.string().uuid() });
const putBodySchema = z.object({
  articleId: z.string().uuid(),
  rating: z.number(),
});

function normalizeRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 5) return null;
  return rounded;
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const parsedQuery = parseQuery({
    request,
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    schema: querySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const articleId = parsedQuery.data.articleId;

  const { data, error } = await db
    .from("recipe_ratings")
    .select("rating")
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .maybeSingle();

  if (error) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
    });
  }

  return NextResponse.json({
    rating:
      data && typeof data.rating === "number" ? data.rating : null,
  });
}

export async function PUT(request: NextRequest) {
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

  const parsedBody = await parseJsonBody({
    request,
    schema: putBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const rating = normalizeRating(parsedBody.data.rating);
  if (rating === null) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "rating must be an integer from 0 to 5",
    });
  }

  const { error } = await db.from("recipe_ratings").upsert(
    {
      user_id: userId,
      article_id: parsedBody.data.articleId,
      rating,
      rated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,article_id" }
  );

  if (error) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
    });
  }

  return NextResponse.json({ ok: true, rating });
}
