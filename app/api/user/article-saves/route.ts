import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function logSaveEvent(userId: string, articleId: string): Promise<void> {
  const { error } = await db.from("article_engagement_events").insert({
    user_id: userId,
    article_id: articleId,
    event_type: "save",
    event_value: 1,
    context: { source: "saved" },
  });
  if (error) {
    console.warn("[article-saves] Could not log engagement event:", error.message);
  }
}

function saveErrorPayload(message: string): { error: string; hint?: string } {
  const m = message.toLowerCase();
  if (
    m.includes("article_saves") ||
    m.includes("schema cache") ||
    m.includes("does not exist")
  ) {
    return {
      error: message,
      hint: "Create the table: run lib/db/migrations/010_article_saves_and_likes.sql in the Supabase SQL Editor, then wait a few seconds.",
    };
  }
  return { error: message };
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articleId = request.nextUrl.searchParams.get("articleId");
  if (articleId !== null && articleId !== "") {
    if (!UUID_RE.test(articleId)) {
      return NextResponse.json({ error: "Invalid articleId" }, { status: 400 });
    }

    const { data, error } = await db
      .from("article_saves")
      .select("id")
      .eq("user_id", userId)
      .eq("article_id", articleId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(saveErrorPayload(error.message), { status: 500 });
    }

    return NextResponse.json({
      saved: Boolean(data),
      saveId: (data?.id as string | undefined) ?? null,
    });
  }

  const { data, error } = await db
    .from("article_saves")
    .select("id, article_id, article_title, article_url, summary, saved_at, is_read")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(saveErrorPayload(error.message), { status: 500 });
  }

  const items = (data ?? []).map((r) => ({
    id: r.id,
    articleId: r.article_id,
    articleTitle: r.article_title,
    articleUrl: r.article_url,
    summary: r.summary,
    savedAt: r.saved_at,
    isRead: r.is_read,
  }));

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    articleId?: unknown;
    articleTitle?: unknown;
    articleUrl?: unknown;
    summary?: unknown;
  };

  if (typeof body.articleId !== "string" || !body.articleId) {
    return NextResponse.json({ error: "articleId required" }, { status: 400 });
  }
  if (typeof body.articleTitle !== "string" || !body.articleTitle.trim()) {
    return NextResponse.json({ error: "articleTitle required" }, { status: 400 });
  }

  const { data, error } = await db
    .from("article_saves")
    .upsert(
      {
        user_id: userId,
        article_id: body.articleId,
        article_title: body.articleTitle.trim(),
        article_url:
          typeof body.articleUrl === "string" && body.articleUrl.trim()
            ? body.articleUrl.trim()
            : null,
        summary:
          typeof body.summary === "string" && body.summary.trim()
            ? body.summary.trim()
            : null,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "user_id,article_id" }
    )
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(saveErrorPayload(error.message), { status: 500 });
  }

  await logSaveEvent(userId, body.articleId);

  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await db
    .from("article_saves")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) {
    return NextResponse.json(saveErrorPayload(error.message), { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
