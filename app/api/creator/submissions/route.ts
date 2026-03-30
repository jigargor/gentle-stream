import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { CATEGORIES, type Category } from "@/lib/constants";
import type { SubmissionContentKind } from "@/lib/types";
import { getOrCreateUserProfile } from "@/lib/db/users";
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

const DAILY_SUBMISSION_LIMIT = 10;

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

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateUserProfile(userId);
  if (profile.userRole !== "creator") {
    return NextResponse.json({ error: "Creator access required" }, { status: 403 });
  }

  const submissions = await listSubmissionsByAuthor(userId);
  return NextResponse.json({ submissions });
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = consumeRateLimit({
    policy: { id: "creator-submission", windowMs: 60 * 60 * 1000, max: 25 },
    key: buildRateLimitKey({
      request,
      userId,
      routeId: "api-creator-submissions",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);

  const profile = await getOrCreateUserProfile(userId);
  if (profile.userRole !== "creator") {
    return NextResponse.json({ error: "Creator access required" }, { status: 403 });
  }

  const creatorProfile = await getCreatorProfile(userId);
  if (!creatorProfile?.onboardingCompletedAt) {
    return NextResponse.json(
      { error: "Complete creator onboarding before submitting articles." },
      { status: 400 }
    );
  }

  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const submissionsToday = await countSubmissionsSince({
    authorUserId: userId,
    createdAfterIso: dayStart.toISOString(),
  });
  if (submissionsToday >= DAILY_SUBMISSION_LIMIT) {
    return NextResponse.json(
      { error: `Daily submission limit reached (${DAILY_SUBMISSION_LIMIT}).` },
      { status: 429 }
    );
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

    recipeServings?: unknown;
    recipeIngredients?: unknown;
    recipeInstructions?: unknown;
    recipePrepTimeMinutes?: unknown;
    recipeCookTimeMinutes?: unknown;
    recipeImages?: unknown;
  };

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

  const isRecipe = contentKind === "recipe";
  const fallbackRecipeCategory = CATEGORIES[0];

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
    ? body.explicitHashtags.filter((v): v is string => typeof v === "string")
    : [];

  if (!headline || (!isRecipe && !category)) {
    return NextResponse.json(
      { error: isRecipe ? "headline is required." : "headline and valid category are required." },
      { status: 400 }
    );
  }

  let articleBody = "";

  if (isRecipe) {
    if (recipeServings == null || recipeServings <= 0) {
      return NextResponse.json(
        { error: "recipeServings must be a positive integer." },
        { status: 400 }
      );
    }
    if (recipeIngredients.length === 0) {
      return NextResponse.json(
        { error: "recipeIngredients is required." },
        { status: 400 }
      );
    }
    if (recipeInstructions.length === 0) {
      return NextResponse.json(
        { error: "recipeInstructions is required." },
        { status: 400 }
      );
    }
    if (
      recipePrepTimeMinutes == null ||
      recipeCookTimeMinutes == null ||
      recipePrepTimeMinutes < 0 ||
      recipeCookTimeMinutes < 0
    ) {
      return NextResponse.json(
        { error: "prep/cook times are required and must be integers >= 0." },
        { status: 400 }
      );
    }

    // Keep `body` useful for tagger + any legacy display.
    articleBody = [
      `Ingredients:\n${recipeIngredients.map((i) => `- ${i}`).join("\n")}`,
      `Instructions:\n${recipeInstructions.join("\n\n")}`,
    ].join("\n\n");
  } else {
    const rawArticleBody = typeof body.body === "string" ? body.body.trim() : "";
    if (rawArticleBody.length > 15_000) {
      return NextResponse.json(
        { error: "body must be 15,000 characters or fewer." },
        { status: 400 }
      );
    }
    if (!rawArticleBody) {
      return NextResponse.json({ error: "body is required." }, { status: 400 });
    }
    articleBody = rawArticleBody;
  }

  const submission = await createSubmission({
    authorUserId: userId,
    headline,
    subheadline,
    body: articleBody,
    pullQuote,
    category: isRecipe ? fallbackRecipeCategory : (category as Category),
    contentKind,
    locale,
    explicitHashtags,
    recipeServings: isRecipe ? recipeServings : undefined,
    recipeIngredients: isRecipe ? recipeIngredients : undefined,
    recipeInstructions: isRecipe ? recipeInstructions : undefined,
    recipePrepTimeMinutes: isRecipe ? recipePrepTimeMinutes : undefined,
    recipeCookTimeMinutes: isRecipe ? recipeCookTimeMinutes : undefined,
    recipeImages: isRecipe ? recipeImages : undefined,
  });
  return NextResponse.json({ submission }, { status: 201 });
}
