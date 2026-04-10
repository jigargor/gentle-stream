import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import {
  GUEST_ACCESS_COOKIE,
  guestAccessCookieOptions,
} from "@/lib/auth/guest-access";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { getClientIp } from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { parseJsonBody } from "@/lib/validation/http";

const guestAccessBodySchema = z
  .object({
    turnstileToken: z.string().trim().optional().default(""),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: guestAccessBodySchema,
  });
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GUEST_ACCESS_COOKIE, "1", guestAccessCookieOptions());
  return response;
}

