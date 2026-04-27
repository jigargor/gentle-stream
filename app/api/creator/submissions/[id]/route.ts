import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES, RECIPE_CATEGORY, type Category } from "@/lib/constants";
import type { SubmissionContentKind } from "@/lib/types";
import { getSubmissionByIdForAuthor, updateSubmissionForAuthor } from "@/lib/db/creator";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import { isBuiltInArticleType } from "@/lib/creator/article-types";

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function isSubmissionContentKind(value: string): value is SubmissionContentKind {
  return value === "user_article" || value === "recipe";
}

function toSafeText(value: unknown, maxLen: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, maxLen);
}

const updateSubmissionBodySchema = z.object({
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
  withdraw: z.boolean().optional(),
  recipeServings: z.union([z.number(), z.string()]).optional(),
  recipeIngredients: z.union([z.array(z.string()), z.string()]).optional(),
  recipeInstructions: z.union([z.array(z.string()), z.string()]).optional(),
  recipePrepTimeMinutes: z.union([z.number(), z.string()]).optional(),
  recipeCookTimeMinutes: z.union([z.number(), z.string()]).optional(),
  recipeImages: z.array(z.string()).optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const access = await requireCreatorAccess(request, { requireMfa: true });
  if (isCreatorAccessDenied(access)) return access;
  const match = await getSubmissionByIdForAuthor({
    id: params.id,
    authorUserId: access.userId,
  });
  if (!match) {
    return apiErrorResponse({
      request,
      status: 404,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "Submission not found.",
    });
  }
  return NextResponse.json({ submission: match });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }
  const params = await context.params;
  const access = await requireCreatorAccess(request, { requireMfa: true });
  if (isCreatorAccessDenied(access)) return access;
  const userId = access.userId;

  const parsedBody = await parseJsonBody({
    request,
    schema: updateSubmissionBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const rawArticleBody =
    typeof body.body === "string" ? body.body.trim() : undefined;
  if (rawArticleBody !== undefined && rawArticleBody.length > 15_000) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "body must be 15,000 characters or fewer.",
    });
  }

  const updates: Parameters<typeof updateSubmissionForAuthor>[0] = {
    id: params.id,
    authorUserId: userId,
  };
  const headline = toSafeText(body.headline, 180);
  const subheadline = toSafeText(body.subheadline, 220);
  const articleBody = rawArticleBody;
  const pullQuote = toSafeText(body.pullQuote, 400);
  const locale = toSafeText(body.locale, 64);
  const categoryRaw = toSafeText(body.category, 80);
  const contentKindRaw = toSafeText(body.contentKind, 40);
  const articleTypeRaw = toSafeText(body.articleType, 120);
  const articleTypeCustom = toSafeText(body.articleTypeCustom, 160);

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

  const isRecipeUpdate =
    contentKindRaw === "recipe" ||
    body.recipeServings !== undefined ||
    body.recipeIngredients !== undefined ||
    body.recipeInstructions !== undefined ||
    body.recipePrepTimeMinutes !== undefined ||
    body.recipeCookTimeMinutes !== undefined ||
    body.recipeImages !== undefined;
  if (headline !== undefined) updates.headline = headline;
  if (subheadline !== undefined) updates.subheadline = subheadline;
  if (articleBody !== undefined) updates.body = articleBody;
  if (pullQuote !== undefined) updates.pullQuote = pullQuote;
  if (locale !== undefined) updates.locale = locale || "global";
  if (categoryRaw !== undefined) {
    if (contentKindRaw === "recipe") {
      updates.category = RECIPE_CATEGORY;
    } else if (!categoryRaw || !isCategory(categoryRaw)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid category",
      });
    } else {
      updates.category = categoryRaw;
    }
  }
  if (contentKindRaw !== undefined) {
    if (!contentKindRaw || !isSubmissionContentKind(contentKindRaw)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid content kind",
      });
    }
    updates.contentKind = contentKindRaw;
  }
  if (articleTypeRaw !== undefined) {
    updates.articleType = articleTypeRaw && isBuiltInArticleType(articleTypeRaw) ? articleTypeRaw : null;
  }
  if (articleTypeCustom !== undefined) {
    updates.articleTypeCustom = articleTypeCustom || null;
  }

  if (isRecipeUpdate) {
    const recipeServings = body.recipeServings !== undefined ? parseNumberOrNull(body.recipeServings) : undefined;
    const recipeIngredients =
      body.recipeIngredients !== undefined ? parseStringList(body.recipeIngredients) : undefined;
    const recipeInstructions =
      body.recipeInstructions !== undefined ? parseMultistepList(body.recipeInstructions) : undefined;
    const recipePrepTimeMinutes =
      body.recipePrepTimeMinutes !== undefined ? parseNumberOrNull(body.recipePrepTimeMinutes) : undefined;
    const recipeCookTimeMinutes =
      body.recipeCookTimeMinutes !== undefined ? parseNumberOrNull(body.recipeCookTimeMinutes) : undefined;
    const recipeImages =
      Array.isArray(body.recipeImages)
        ? (body.recipeImages.filter((v): v is string => typeof v === "string").slice(0, 3) as string[])
        : undefined;

    if (recipeServings !== undefined && (recipeServings == null || recipeServings <= 0)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "recipeServings must be a positive integer.",
      });
    }
    if (recipePrepTimeMinutes !== undefined && (recipePrepTimeMinutes == null || recipePrepTimeMinutes < 0)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "prep time must be an integer >= 0.",
      });
    }
    if (recipeCookTimeMinutes !== undefined && (recipeCookTimeMinutes == null || recipeCookTimeMinutes < 0)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "cook time must be an integer >= 0.",
      });
    }
    if (recipeIngredients !== undefined && recipeIngredients.length === 0) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "recipeIngredients is required.",
      });
    }
    if (recipeInstructions !== undefined && recipeInstructions.length === 0) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "recipeInstructions is required.",
      });
    }

    if (body.recipeServings !== undefined) updates.recipeServings = recipeServings;
    if (body.recipeIngredients !== undefined) updates.recipeIngredients = recipeIngredients;
    if (body.recipeInstructions !== undefined) updates.recipeInstructions = recipeInstructions;
    if (body.recipePrepTimeMinutes !== undefined) updates.recipePrepTimeMinutes = recipePrepTimeMinutes;
    if (body.recipeCookTimeMinutes !== undefined) updates.recipeCookTimeMinutes = recipeCookTimeMinutes;
    if (body.recipeImages !== undefined) updates.recipeImages = recipeImages;
  }
  if (Array.isArray(body.explicitHashtags)) {
    updates.explicitHashtags = body.explicitHashtags.filter(
      (v): v is string => typeof v === "string"
    );
  }
  if (body.withdraw === true) {
    updates.withdraw = true;
  }

  if (Object.keys(updates).length <= 2) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.MISSING_FIELD,
      message: "No update fields supplied",
    });
  }

  try {
    const submission = await updateSubmissionForAuthor(updates);
    return NextResponse.json({ submission });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : "";
    const status = rawMessage.includes("not found")
      ? 404
      : rawMessage.includes("pending")
        ? 409
        : 500;
    if (status === 404) {
      return apiErrorResponse({
        request,
        status,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Not found",
      });
    }
    if (status === 409) {
      return apiErrorResponse({
        request,
        status,
        code: API_ERROR_CODES.INVALID_REQUEST,
        message: "Submission must be pending",
      });
    }
    return internalErrorResponse({ request, error });
  }
}
