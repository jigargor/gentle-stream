import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { CATEGORIES, type Category } from "@/lib/constants";
import type { SubmissionContentKind } from "@/lib/types";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { updateSubmissionForAuthor } from "@/lib/db/creator";

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateUserProfile(userId);
  if (profile.userRole !== "creator") {
    return NextResponse.json({ error: "Creator access required" }, { status: 403 });
  }

  const body = (await request.json()) as {
    headline?: unknown;
    subheadline?: unknown;
    body?: unknown;
    pullQuote?: unknown;
    category?: unknown;
    contentKind?: unknown;
    locale?: unknown;
    explicitHashtags?: unknown;
    withdraw?: unknown;

    recipeServings?: unknown;
    recipeIngredients?: unknown;
    recipeInstructions?: unknown;
    recipePrepTimeMinutes?: unknown;
    recipeCookTimeMinutes?: unknown;
    recipeImages?: unknown;
  };
  const rawArticleBody =
    typeof body.body === "string" ? body.body.trim() : undefined;
  if (rawArticleBody !== undefined && rawArticleBody.length > 15_000) {
    return NextResponse.json(
      { error: "body must be 15,000 characters or fewer." },
      { status: 400 }
    );
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
    if (!categoryRaw || !isCategory(categoryRaw)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    updates.category = categoryRaw;
  }
  if (contentKindRaw !== undefined) {
    if (!contentKindRaw || !isSubmissionContentKind(contentKindRaw)) {
      return NextResponse.json({ error: "Invalid content kind" }, { status: 400 });
    }
    updates.contentKind = contentKindRaw;
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
      return NextResponse.json({ error: "recipeServings must be a positive integer." }, { status: 400 });
    }
    if (recipePrepTimeMinutes !== undefined && (recipePrepTimeMinutes == null || recipePrepTimeMinutes < 0)) {
      return NextResponse.json({ error: "prep time must be an integer >= 0." }, { status: 400 });
    }
    if (recipeCookTimeMinutes !== undefined && (recipeCookTimeMinutes == null || recipeCookTimeMinutes < 0)) {
      return NextResponse.json({ error: "cook time must be an integer >= 0." }, { status: 400 });
    }
    if (recipeIngredients !== undefined && recipeIngredients.length === 0) {
      return NextResponse.json({ error: "recipeIngredients is required." }, { status: 400 });
    }
    if (recipeInstructions !== undefined && recipeInstructions.length === 0) {
      return NextResponse.json({ error: "recipeInstructions is required." }, { status: 400 });
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
    return NextResponse.json({ error: "No update fields supplied" }, { status: 400 });
  }

  try {
    const submission = await updateSubmissionForAuthor(updates);
    return NextResponse.json({ submission });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found")
      ? 404
      : message.includes("pending")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
