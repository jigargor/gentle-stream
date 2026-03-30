import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { CATEGORIES, type Category } from "@/lib/constants";
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
    locale?: unknown;
    explicitHashtags?: unknown;
  };
  const rawArticleBody =
    typeof body.body === "string" ? body.body.trim() : "";
  if (rawArticleBody.length > 15_000) {
    return NextResponse.json(
      { error: "body must be 15,000 characters or fewer." },
      { status: 400 }
    );
  }

  const headline = toSafeText(body.headline, 180);
  const subheadline = toSafeText(body.subheadline, 220);
  const articleBody = rawArticleBody;
  const pullQuote = toSafeText(body.pullQuote, 400);
  const locale = toSafeText(body.locale, 64) || "global";
  const categoryRaw = toSafeText(body.category, 80);
  const category = isCategory(categoryRaw) ? categoryRaw : null;
  const explicitHashtags = Array.isArray(body.explicitHashtags)
    ? body.explicitHashtags.filter((v): v is string => typeof v === "string")
    : [];

  if (!headline || !articleBody || !category) {
    return NextResponse.json(
      { error: "headline, body, and valid category are required." },
      { status: 400 }
    );
  }

  const submission = await createSubmission({
    authorUserId: userId,
    headline,
    subheadline,
    body: articleBody,
    pullQuote,
    category,
    locale,
    explicitHashtags,
  });
  return NextResponse.json({ submission }, { status: 201 });
}
