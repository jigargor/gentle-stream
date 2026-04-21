import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
import { getOrCreateUserProfile } from "@/lib/db/users";
import {
  buildRateLimitKey,
  consumeRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import {
  SESSION_START_COOKIE,
  sessionStartCookieOptions,
} from "@/lib/auth/session-policy";
import { CREATOR_LOGIN_ENABLED } from "@/lib/feature-flags/regulatory";
import { logWarning } from "@/lib/observability/logger";

const emailPasswordBodySchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(256),
    mode: z.enum(["sign_in", "sign_up"]),
    audience: z.enum(["subscriber", "creator"]).optional().default("subscriber"),
    birthDate: z.string().trim().optional().default(""),
    redirectTo: z.string().trim().url(),
    turnstileToken: z.string().trim().optional().default(""),
  })
  .strict();

function allowedAuthOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // ignore malformed request URL
  }

  const envOrigin = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim();
  if (envOrigin) {
    try {
      origins.add(new URL(envOrigin).origin);
    } catch {
      // ignore malformed env value
    }
  }
  return origins;
}

function isAllowedRedirectTo(request: NextRequest, redirectTo: string): boolean {
  try {
    const parsed = new URL(redirectTo);
    return allowedAuthOrigins(request).has(parsed.origin);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }

  const ipLimit = await consumeRateLimit({
    policy: { id: "auth-email-password-ip", windowMs: 10 * 60 * 1000, max: 20 },
    key: buildRateLimitKey({ request, routeId: "auth-email-password" }),
  });
  if (!ipLimit.allowed) return rateLimitExceededResponse(ipLimit, request);

  const parsedBody = await parseJsonBody({
    request,
    schema: emailPasswordBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;

  const email = parsedBody.data.email.trim().toLowerCase();
  const password = parsedBody.data.password;
  const mode = parsedBody.data.mode;
  const audience = parsedBody.data.audience;
  const birthDate = parsedBody.data.birthDate.trim();
  const redirectTo = parsedBody.data.redirectTo.trim();
  const turnstileToken = parsedBody.data.turnstileToken.trim();

  if (audience === "creator" && !CREATOR_LOGIN_ENABLED) {
    return apiErrorResponse({
      request,
      status: 503,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message:
        "Creator login is a work in progress and is temporarily disabled pending approval from the appropriate regulatory agencies.",
    });
  }
  if (!redirectTo || !isAllowedRedirectTo(request, redirectTo)) {
    const allowed = Array.from(allowedAuthOrigins(request));
    const providedOrigin = (() => {
      try {
        return new URL(redirectTo).origin;
      } catch {
        return null;
      }
    })();
    logWarning("auth.email_password.rejected_redirect_origin", {
      redirectTo,
      providedOrigin,
      allowedOrigins: allowed.join(", "),
    });
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid auth redirect URL. Check Supabase Redirect URLs and auth origin env.",
    });
  }

  const emailLimit = await consumeRateLimit({
    policy: { id: "auth-email-password-email", windowMs: 10 * 60 * 1000, max: 10 },
    key: `email:${email}`,
  });
  if (!emailLimit.allowed) return rateLimitExceededResponse(emailLimit, request);

  const captcha = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: getClientIp(request),
  });
  if (!captcha.success) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: captcha.error,
    });
  }

  if (mode === "sign_up" && audience === "subscriber" && !birthDate) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.MISSING_FIELD,
      message: "Birthdate is required to create a subscriber account.",
    });
  }

  if (mode === "sign_up" && birthDate) {
    const parsedBirthDate = Date.parse(birthDate);
    if (Number.isNaN(parsedBirthDate)) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Birthdate must be a valid date.",
      });
    }
    const ageMs = Date.now() - parsedBirthDate;
    if (ageMs < 0) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Birthdate cannot be in the future.",
      });
    }
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears < 13) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "You must be at least 13 years old to create an account.",
      });
    }
  }

  if (audience === "creator" && mode === "sign_up") {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Creator login supports sign-in only.",
    });
  }

  if (mode === "sign_up") {
    const supabase = createPublicServerClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          audience,
          birthDate: birthDate || null,
        },
      },
    });
    if (error) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.INVALID_REQUEST,
        message: "Could not create account right now.",
      });
    }
    return NextResponse.json({
      ok: true,
      requiresEmailVerification: false,
      verificationEmailSent: true,
    });
  }

  const response = NextResponse.json({
    ok: true,
    requiresEmailVerification: false,
  });
  const supabase = createSupabaseResponseClient(request, response);
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid email or password.",
    });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    await supabase.auth.signOut();
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Could not load account details after sign-in.",
    });
  }

  if (audience === "creator") {
    const emailConfirmedAt =
      (user as { email_confirmed_at?: string | null }).email_confirmed_at ?? null;
    if (!emailConfirmedAt) {
      await supabase.auth.signOut();
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "Creator login requires a verified email address.",
      });
    }
    const phoneConfirmedAt =
      (user as { phone_confirmed_at?: string | null }).phone_confirmed_at ?? null;
    if (!user.phone || !phoneConfirmedAt) {
      await supabase.auth.signOut();
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "Creator login requires a verified phone number.",
      });
    }

    const profile = await getOrCreateUserProfile(user.id);
    if (profile.userRole !== "creator") {
      await supabase.auth.signOut();
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "This account is not a creator account. Use subscriber login.",
      });
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  response.cookies.set(
    SESSION_START_COOKIE,
    String(nowSec),
    sessionStartCookieOptions()
  );
  return response;
}
