import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { listSubmissionsForAdmin } from "@/lib/db/creator";
import type { ArticleSubmissionStatus } from "@/lib/types";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

function parseStatus(value: string | null): ArticleSubmissionStatus | undefined {
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected" ||
    value === "withdrawn"
  ) {
    return value;
  }
  return undefined;
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

  const status = parseStatus(new URL(request.url).searchParams.get("status"));
  const submissions = await listSubmissionsForAdmin(status);
  return NextResponse.json({ submissions });
}
