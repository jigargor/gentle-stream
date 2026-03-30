import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { getUserGameStats } from "@/lib/db/gameStats";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

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

  const raw = request.nextUrl.searchParams.get("recent");
  const recentLimit = raw ? parseInt(raw, 10) : 8;
  const safe = Number.isFinite(recentLimit) ? recentLimit : 8;

  try {
    const stats = await getUserGameStats(userId, safe);
    return NextResponse.json(stats);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
