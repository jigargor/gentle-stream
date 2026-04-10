import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  type ModerationQueueFilter,
  listArticlesForModeration,
} from "@/lib/db/articleModeration";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

function parseFilter(value: string | null): ModerationQueueFilter {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "flagged" ||
    value === "rejected"
  ) {
    return value;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Admin access required",
    });
  }

  const url = new URL(request.url);
  const filter = parseFilter(url.searchParams.get("status"));
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  try {
    const items = await listArticlesForModeration({ filter, limit });
    return NextResponse.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
