import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { parseJsonBody, parseQuery } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const getQuerySchema = z.object({
  articleId: z.string().uuid().optional(),
});
const deleteQuerySchema = z.object({
  id: z.string().min(1),
});
const postBodySchema = z.object({
  articleId: z.string().uuid(),
  articleTitle: z.string().trim().min(1),
  articleUrl: z.string().optional(),
  summary: z.string().optional(),
});

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
    schema: getQuerySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const articleId = parsedQuery.data.articleId ?? null;
  if (articleId !== null && articleId !== "") {
    if (!UUID_RE.test(articleId)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid articleId",
      });
    }

    const { data, error } = await db
      .from("article_saves")
      .select("id")
      .eq("user_id", userId)
      .eq("article_id", articleId)
      .maybeSingle();

    if (error) {
      return apiErrorResponse({
        request,
        status: 500,
        code: API_ERROR_CODES.INTERNAL,
        message: error.message,
        details: saveErrorPayload(error.message).hint
          ? { hint: saveErrorPayload(error.message).hint }
          : undefined,
      });
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
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
      details: saveErrorPayload(error.message).hint
        ? { hint: saveErrorPayload(error.message).hint }
        : undefined,
    });
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
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: postBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

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
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
      details: saveErrorPayload(error.message).hint
        ? { hint: saveErrorPayload(error.message).hint }
        : undefined,
    });
  }

  await logSaveEvent(userId, body.articleId);

  return NextResponse.json({ ok: true, id: data?.id });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const parsedDeleteQuery = parseQuery({
    request,
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    schema: deleteQuerySchema,
  });
  if (!parsedDeleteQuery.ok) return parsedDeleteQuery.response;
  const id = parsedDeleteQuery.data.id;

  const { error } = await db
    .from("article_saves")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
      details: saveErrorPayload(error.message).hint
        ? { hint: saveErrorPayload(error.message).hint }
        : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
