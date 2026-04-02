import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

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

  try {
    await getOrCreateUserProfile(userId);
    const acceptedAt = new Date().toISOString();
    const { error } = await db
      .from("user_profiles")
      .update({ terms_accepted_at: acceptedAt })
      .eq("user_id", userId);
    if (error) {
      return apiErrorResponse({
        request,
        status: 500,
        code: API_ERROR_CODES.INTERNAL,
        message: `Could not save terms acceptance: ${error.message}`,
      });
    }
    return NextResponse.json({ ok: true, termsAcceptedAt: acceptedAt });
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

