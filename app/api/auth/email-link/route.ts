import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
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

const emailLinkBodySchema = z.object({
  email: z.string().trim().email(),
  redirectTo: z.string().trim().url(),
  turnstileToken: z.string().trim().min(1),
});

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
    policy: { id: "auth-email-link-ip", windowMs: 10 * 60 * 1000, max: 16 },
    key: buildRateLimitKey({ request, routeId: "auth-email-link" }),
  });
  if (!ipLimit.allowed) return rateLimitExceededResponse(ipLimit, request);

  const parsedBody = await parseJsonBody({
    request,
    schema: emailLinkBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const email = parsedBody.data.email.trim().toLowerCase();
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
    policy: { id: "auth-email-link-email", windowMs: 10 * 60 * 1000, max: 6 },
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

  const supabase = createPublicServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Could not send sign-in link right now.",
    });
  }

  return NextResponse.json({ ok: true });
}
