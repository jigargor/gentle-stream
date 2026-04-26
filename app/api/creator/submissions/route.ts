import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES, RECIPE_CATEGORY, type Category } from "@/lib/constants";
import type { SubmissionContentKind } from "@/lib/types";
import {
  countSubmissionsSince,
  createSubmission,
  getCreatorProfile,
  listSubmissionsByAuthor,
} from "@/lib/db/creator";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import { isBuiltInArticleType } from "@/lib/creator/article-types";

const DAILY_SUBMISSION_LIMIT = 10;

const submissionBodySchema = z.object({
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  body: z.string().optional(),
  pullQuote: z.string().optional(),
  category: z.string().optional(),
  contentKind: z.string().optional(),
  articleType: z.string().optional(),
  articleTypeCustom: z.string().optional(),
  locale: z.string().optional(),
  explicitHashtags: z.array(z.string()).optional(),
  recipeServings: z.union([z.number(), z.string()]).optional(),
  recipeIngredients: z.union([z.array(z.string()), z.string()]).optional(),
  recipeInstructions: z.union([z.array(z.string()), z.string()]).optional(),
  recipePrepTimeMinutes: z.union([z.number(), z.string()]).optional(),
  recipeCookTimeMinutes: z.union([z.number(), z.string()]).optional(),
  recipeImages: z.array(z.string()).optional(),
});

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function isSubmissionContentKind(value: string): value is SubmissionContentKind {
  return value === "user_article" || value === "recipe";
}

function toSafeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export async function GET(request: NextRequest) {
  const access = await requireCreatorAccess(request, { requireMfa: true });
  if (isCreatorAccessDenied(access)) return access;
  const userId = access.userId;

  const search = request.nextUrl.searchParams;
  const limitRaw = Number.parseInt(search.get("limit") ?? "12", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 12;
  const cursor = search.get("cursor");
  const includeBody = search.get("includeBody") === "1";
  const { submissions, nextCursor } = await listSubmissionsByAuthor({
    authorUserId: userId,
    limit,
    cursorCreatedAt: cursor,
    includeBody,
  });
  return NextResponse.json({ submissions, nextCursor });
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }

  const access = await requireCreatorAccess(request, { requireMfa: true });
  if (isCreatorAccessDenied(access)) return access;
  const userId = access.userId;

  const rateLimit = await consumeRateLimit({
    policy: { id: "creator-submission", windowMs: 60 * 60 * 1000, max: 25 },
    key: buildRateLimitKey({
      request,
      userId,
      routeId: "api-creator-submissions",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

  const creatorProfile = await getCreatorProfile(userId);
  if (!creatorProfile?.onboardingCompletedAt) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Complete creator onboarding before submitting articles.",
    });
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const submissionsToday = await countSubmissionsSince({
    authorUserId: userId,
    createdAfterIso: dayStart.toISOString(),
  });
  if (submissionsToday >= DAILY_SUBMISSION_LIMIT) {
    return apiErrorResponse({
      request,
      status: 429,
      code: API_ERROR_CODES.RATE_LIMITED,
      message: `Daily submission limit reached (${DAILY_SUBMISSION_LIMIT}).`,
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: submissionBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const headline = toSafeText(body.headline, 180);
  const subheadline = toSafeText(body.subheadline, 220);
  const pullQuote = toSafeText(body.pullQuote, 400);
  const locale = toSafeText(body.locale, 64) || "global";
  const categoryRaw = toSafeText(body.category, 80);
  const category = isCategory(categoryRaw) ? categoryRaw : null;
  const contentKindRaw = toSafeText(body.contentKind, 40);
  const contentKind: SubmissionContentKind =
    contentKindRaw && isSubmissionContentKind(contentKindRaw)
      ? contentKindRaw
      : "user_article";
  const articleTypeRaw = toSafeText(body.articleType, 120);
  const articleTypeCustom = toSafeText(body.articleTypeCustom, 160) || null;
  const articleType =
    articleTypeRaw && isBuiltInArticleType(articleTypeRaw) ? articleTypeRaw : null;

  const isRecipe = contentKind === "recipe";

  const parseNumberOrNull = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string" && v.trim().length > 0) {
      const n = Math.trunc(Number(v));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const parseStringList = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "string") {
      return v
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const parseMultistepList = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "string") {
      return v
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const recipeServings = parseNumberOrNull(body.recipeServings);
  const recipeIngredients = parseStringList(body.recipeIngredients);
  const recipeInstructions = parseMultistepList(body.recipeInstructions);
  const recipePrepTimeMinutes = parseNumberOrNull(body.recipePrepTimeMinutes);
  const recipeCookTimeMinutes = parseNumberOrNull(body.recipeCookTimeMinutes);

  const recipeImages = Array.isArray(body.recipeImages)
    ? body.recipeImages.filter((v): v is string => typeof v === "string").slice(0, 3)
    : [];

  const explicitHashtags = Array.isArray(body.explicitHashtags)
    ? body.explicitHashtags
    : [];

  if (!headline || (!isRecipe && !category)) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.MISSING_FIELD,
      message: isRecipe
        ? "headline is required."
        : "headline and valid category are required.",
    });
  }

  let articleBody = "";

  if (isRecipe) {
    if (recipeServings == null || recipeServings <= 0) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "recipeServings must be a positive integer.",
      });
    }
    if (recipeIngredients.length === 0) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "recipeIngredients is required.",
      });
    }
    if (recipeInstructions.length === 0) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "recipeInstructions is required.",
      });
    }
    if (
      recipePrepTimeMinutes == null ||
      recipeCookTimeMinutes == null ||
      recipePrepTimeMinutes < 0 ||
      recipeCookTimeMinutes < 0
    ) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "prep/cook times are required and must be integers >= 0.",
      });
    }

    // Keep `body` useful for tagger + any legacy display.
    articleBody = [
      `Ingredients:\n${recipeIngredients.map((i) => `- ${i}`).join("\n")}`,
      `Instructions:\n${recipeInstructions.join("\n\n")}`,
    ].join("\n\n");
  } else {
    const rawArticleBody = typeof body.body === "string" ? body.body.trim() : "";
    if (rawArticleBody.length > 15_000) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "body must be 15,000 characters or fewer.",
      });
    }
    if (!rawArticleBody) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "body is required.",
      });
    }
    articleBody = rawArticleBody;
  }

  const submission = await createSubmission({
    authorUserId: userId,
    headline,
    subheadline,
    body: articleBody,
    pullQuote,
    category: isRecipe ? RECIPE_CATEGORY : (category as Category),
    contentKind,
    locale,
    explicitHashtags,
    articleType: isRecipe ? null : (articleType ?? (articleTypeCustom ? "custom" : null)),
    articleTypeCustom: isRecipe ? null : articleTypeCustom,
    recipeServings: isRecipe ? recipeServings : undefined,
    recipeIngredients: isRecipe ? recipeIngredients : undefined,
    recipeInstructions: isRecipe ? recipeInstructions : undefined,
    recipePrepTimeMinutes: isRecipe ? recipePrepTimeMinutes : undefined,
    recipeCookTimeMinutes: isRecipe ? recipeCookTimeMinutes : undefined,
    recipeImages: isRecipe ? recipeImages : undefined,
  });
  return NextResponse.json({ submission }, { status: 201 });
}
