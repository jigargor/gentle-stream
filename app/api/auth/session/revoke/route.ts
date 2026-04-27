import { NextRequest, NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
import { SESSION_START_COOKIE } from "@/lib/auth/session-policy";
import { assertCreatorMutationOrigin } from "@/lib/auth/creator-security";

export async function POST(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;

    const response = NextResponse.json({ ok: true });
    const supabase = createSupabaseResponseClient(request, response);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return apiErrorResponse({
        request,
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: "Unauthorized",
      });
    }
    await supabase.auth.signOut({ scope: "global" });
    response.cookies.delete(SESSION_START_COOKIE);
    return response;
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
