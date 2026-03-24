import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import type { ArticleEngagementBatchRequest } from "@/lib/engagement/types";
import { parseEngagementBatch } from "@/lib/engagement/contract";

/**
 * Engagement tracking is now rolled out to 100% of authenticated users.
 */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ArticleEngagementBatchRequest | null = null;
  try {
    body = (await request.json()) as ArticleEngagementBatchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseEngagementBatch(body, userId);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { error } = await db.from("article_engagement_events").insert(parsed.rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, accepted: parsed.rows.length });
}

