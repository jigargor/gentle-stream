import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limitParam)))
    : DEFAULT_LIMIT;

  const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("article_engagement_events")
    .select("user_id,occurred_at")
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(limit * 4);

  if (error) {
    return NextResponse.json(
      { error: `Could not load engagement users: ${error.message}` },
      { status: 500 }
    );
  }

  const distinctUserIds = Array.from(
    new Set((data ?? []).map((row) => row.user_id as string).filter(Boolean))
  ).slice(0, limit);

  let refreshed = 0;
  let failed = 0;
  for (const userId of distinctUserIds) {
    const { error: refreshError } = await db.rpc("refresh_user_article_affinity", {
      p_user_id: userId,
    });
    if (refreshError) {
      failed += 1;
      console.error("[affinity-refresh] refresh_user_article_affinity failed", {
        userId,
        message: refreshError.message,
      });
      continue;
    }
    refreshed += 1;
  }

  return NextResponse.json({
    ok: failed === 0,
    checkedUsers: distinctUserIds.length,
    refreshed,
    failed,
    sinceIso,
  });
}
