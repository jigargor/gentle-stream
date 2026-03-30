import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function logLikeEvent(userId: string, articleId: string): Promise<void> {
  const { error } = await db.from("article_engagement_events").insert({
    user_id: userId,
    article_id: articleId,
    event_type: "like",
    event_value: 1,
    context: { source: "direct" },
  });
  if (error) {
    console.warn("[article-likes] Could not log engagement event:", error.message);
  }
}

/** Whether the signed-in user has liked this article (for UI + future ranking). */
export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articleId = request.nextUrl.searchParams.get("articleId");
  if (!articleId || !UUID_RE.test(articleId)) {
    return NextResponse.json({ error: "Invalid articleId" }, { status: 400 });
  }

  const { data, error } = await db
    .from("article_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("article_id", articleId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ liked: Boolean(data) });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    articleId?: unknown;
    articleTitle?: unknown;
  };

  if (typeof body.articleId !== "string" || !UUID_RE.test(body.articleId)) {
    return NextResponse.json({ error: "Invalid articleId" }, { status: 400 });
  }
  if (typeof body.articleTitle !== "string" || !body.articleTitle.trim()) {
    return NextResponse.json({ error: "articleTitle required" }, { status: 400 });
  }

  const { error } = await db.from("article_likes").upsert(
    {
      user_id: userId,
      article_id: body.articleId,
      article_title: body.articleTitle.trim(),
      liked_at: new Date().toISOString(),
    },
    { onConflict: "user_id,article_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logLikeEvent(userId, body.articleId);

  return NextResponse.json({ ok: true, liked: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articleId = request.nextUrl.searchParams.get("articleId");
  if (!articleId || !UUID_RE.test(articleId)) {
    return NextResponse.json({ error: "Invalid articleId" }, { status: 400 });
  }

  const { error } = await db
    .from("article_likes")
    .delete()
    .eq("user_id", userId)
    .eq("article_id", articleId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, liked: false });
}
