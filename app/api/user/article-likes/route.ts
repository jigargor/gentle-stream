import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { parseJsonBody, parseQuery } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const articleQuerySchema = z.object({
  articleId: z.string().uuid(),
});
const postBodySchema = z.object({
  articleId: z.string().uuid(),
  articleTitle: z.string().trim().min(1),
});

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
    schema: articleQuerySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const articleId = parsedQuery.data.articleId;

  const { data, error } = await db
    .from("article_likes")
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
    });
  }

  return NextResponse.json({ liked: Boolean(data) });
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
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
    });
  }

  await logLikeEvent(userId, body.articleId);

  return NextResponse.json({ ok: true, liked: true });
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

  const parsedQuery = parseQuery({
    request,
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    schema: articleQuerySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const articleId = parsedQuery.data.articleId;

  const { error } = await db
    .from("article_likes")
    .delete()
    .eq("user_id", userId)
    .eq("article_id", articleId);

  if (error) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
    });
  }

  return NextResponse.json({ ok: true, liked: false });
}
