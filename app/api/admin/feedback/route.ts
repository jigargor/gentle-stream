import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { listSiteFeedbackForAdmin } from "@/lib/db/siteFeedback";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

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

  const limit = parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10);
  const items = await listSiteFeedbackForAdmin(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json({ items });
}
