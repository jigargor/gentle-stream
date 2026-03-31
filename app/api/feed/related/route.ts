import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listRecentTaggedInCategory } from "@/lib/db/articles";
import { CATEGORIES, RECIPE_CATEGORY } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const ANONYMOUS_USER_ID = "anonymous";

const querySchema = z.object({
  articleId: z.string().uuid(),
  category: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(8).optional().default(3),
});

function isAllowedCategory(value: string): value is Category | typeof RECIPE_CATEGORY {
  return CATEGORIES.includes(value as Category) || value === RECIPE_CATEGORY;
}

export async function GET(request: NextRequest) {
  const sessionUserId = process.env.AUTH_DISABLED === "1" ? null : await getSessionUserId();
  const userId =
    process.env.AUTH_DISABLED === "1"
      ? process.env.DEV_USER_ID ?? "dev-local"
      : sessionUserId || ANONYMOUS_USER_ID;

  const rateLimit = await consumeRateLimit({
    policy:
      userId === ANONYMOUS_USER_ID
        ? { id: "feed-related-anon", windowMs: 60_000, max: 60 }
        : { id: "feed-related-auth", windowMs: 60_000, max: 120 },
    key: buildRateLimitKey({
      request,
      userId: userId === ANONYMOUS_USER_ID ? null : userId,
      routeId: "api-feed-related",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    articleId: url.searchParams.get("articleId"),
    category: url.searchParams.get("category"),
    limit: url.searchParams.get("limit"),
  });
  if (!parsed.success) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid query parameters.",
    });
  }

  const { articleId, category, limit } = parsed.data;
  if (!isAllowedCategory(category)) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid category.",
    });
  }

  try {
    const headlines = await listRecentTaggedInCategory({
      category,
      excludeArticleId: articleId,
      limit,
    });
    return NextResponse.json({ headlines });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
