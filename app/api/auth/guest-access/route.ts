import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import {
  GUEST_ACCESS_COOKIE,
  guestAccessCookieOptions,
} from "@/lib/auth/guest-access";
import { SESSION_START_COOKIE } from "@/lib/auth/session-policy";
import { getRequestOrigin, hasTrustedOrigin } from "@/lib/security/origin";
import { getClientIp } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
import { parseJsonBody } from "@/lib/validation/http";

const guestAccessBodySchema = z
  .object({
    turnstileToken: z.string().trim().optional().default(""),
  })
  .strict();

function wantsJsonResponse(request: NextRequest): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

async function parseGuestAccessBody(
  request: NextRequest
): Promise<
  | { ok: true; data: z.infer<typeof guestAccessBodySchema> }
  | { ok: false; response: NextResponse }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return parseJsonBody({
      request,
      schema: guestAccessBodySchema,
    });
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const parsed = guestAccessBodySchema.safeParse({
      turnstileToken: String(form.get("turnstileToken") ?? ""),
    });
    if (!parsed.success) {
      return {
        ok: false,
        response: apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.VALIDATION,
          message: "Invalid guest access request.",
        }),
      };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    ok: false,
    response: apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid guest access request.",
    }),
  };
}

async function buildGuestAccessSuccessResponse(
  request: NextRequest
): Promise<NextResponse> {
  const response = wantsJsonResponse(request)
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL("/", getRequestOrigin(request)), 303);

  response.cookies.delete(SESSION_START_COOKIE);

  const hasSupabaseSession = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (hasSupabaseSession) {
    try {
      const supabase = createSupabaseResponseClient(request, response);
      await Promise.race([
        supabase.auth.signOut(),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    } catch {
      // Middleware clears stale sessions on the next request.
    }
  }

  response.cookies.set(GUEST_ACCESS_COOKIE, "1", guestAccessCookieOptions());

  return response;
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

  const parsedBody = await parseGuestAccessBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const captcha = await verifyTurnstileToken({
    token: parsedBody.data.turnstileToken,
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

  return buildGuestAccessSuccessResponse(request);
}
