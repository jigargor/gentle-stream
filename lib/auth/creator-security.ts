import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type ApiErrorBody, API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { getEnv } from "@/lib/env";

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
  const env = getEnv();
  if (env.AUTH_DISABLED) {
    const devUserId = (process.env.DEV_USER_ID ?? "dev-local").trim() || "dev-local";
    return { ok: true, userId: devUserId };
  }

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

  const userId = typeof user.id === "string" ? user.id.trim() : "";
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Invalid session (missing user id).",
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

  return { ok: true, userId };
}

export function isCreatorAccessDenied(result: CreatorAccessResponse): result is NextResponse<ApiErrorBody> {
  // Do not use `"ok" in result"`: NextResponse inherits `ok` from Response, so errors would look "successful".
  return result instanceof NextResponse;
}
