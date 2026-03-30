import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { CATEGORIES, type Category } from "@/lib/constants";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { updateSubmissionForAuthor } from "@/lib/db/creator";

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

function toSafeText(value: unknown, maxLen: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, maxLen);
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
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
    locale?: unknown;
    explicitHashtags?: unknown;
    withdraw?: unknown;
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
    id: context.params.id,
    authorUserId: userId,
  };
  const headline = toSafeText(body.headline, 180);
  const subheadline = toSafeText(body.subheadline, 220);
  const articleBody = rawArticleBody;
  const pullQuote = toSafeText(body.pullQuote, 400);
  const locale = toSafeText(body.locale, 64);
  const categoryRaw = toSafeText(body.category, 80);
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
