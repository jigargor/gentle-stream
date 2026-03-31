import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
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

const emailPasswordBodySchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(256),
    mode: z.enum(["sign_in", "sign_up"]),
    redirectTo: z.string().trim().url(),
    turnstileToken: z.string().trim().optional().default(""),
  })
  .strict();

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
  const redirectTo = parsedBody.data.redirectTo.trim();
  const turnstileToken = parsedBody.data.turnstileToken.trim();

  if (!isValidEmail(email)) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid email address.",
    });
  }
  if (!redirectTo || !isAllowedRedirectTo(request, redirectTo)) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid auth redirect URL.",
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

  if (mode === "sign_up") {
    const supabase = createPublicServerClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
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
      requiresEmailVerification: true,
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

  const nowSec = Math.floor(Date.now() / 1000);
  response.cookies.set(
    SESSION_START_COOKIE,
    String(nowSec),
    sessionStartCookieOptions()
  );
  return response;
}
