import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type ApiErrorBody, API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { type NextResponse } from "next/server";

export interface CreatorAccessResult {
  ok: true;
  userId: string;
}

export type CreatorAccessResponse = CreatorAccessResult | NextResponse<ApiErrorBody>;

interface CreatorAccessOptions {
  requireMfa?: boolean;
  requireStepUp?: boolean;
}

export function assertCreatorMutationOrigin(request: NextRequest) {
  if (hasTrustedOrigin(request)) return null;
  return apiErrorResponse({
    request,
    status: 403,
    code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
    message: "Invalid request origin.",
  });
}

export async function requireCreatorAccess(
  request: NextRequest,
  options: CreatorAccessOptions = {}
): Promise<CreatorAccessResponse> {
  const supabase = createClient();
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

  if (!user.email_confirmed_at) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Creator Studio requires verified email.",
    });
  }

  const profile = await getOrCreateUserProfile(user.id);
  if (profile.userRole !== "creator") {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Creator access required.",
    });
  }

  if (options.requireMfa || options.requireStepUp) {
    const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "MFA verification is required.",
      });
    }
    const hasAal2 = aalData.currentLevel === "aal2";
    if (!hasAal2) {
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "TOTP step-up verification is required.",
      });
    }
  }

  return { ok: true, userId: user.id };
}

export function isCreatorAccessDenied(result: CreatorAccessResponse): result is NextResponse<ApiErrorBody> {
  return !("ok" in result);
}
