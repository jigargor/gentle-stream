import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, applyTraceIdHeader } from "@/lib/api/errors";
import { mfaFailureResponse } from "@/lib/auth/mfa-route-helpers";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";

const challengeBodySchema = z
  .object({
    factorId: z.string().uuid(),
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
    schema: challengeBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;

  const response = NextResponse.json({ ok: true as const });
  const supabase = createSupabaseResponseClient(request, response);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Your session is not valid for MFA. Sign in again and retry.",
    });
  }

  const rate = await consumeRateLimit({
    policy: { id: "auth-mfa-challenge", windowMs: 10 * 60 * 1000, max: 40 },
    key: buildRateLimitKey({
      request,
      userId: user.id,
      routeId: "auth-mfa-challenge",
    }),
  });
  if (!rate.allowed) return rateLimitExceededResponse(rate, request);

  try {
    const { data, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: parsedBody.data.factorId,
    });
    if (challengeError) throw challengeError;

    const out = NextResponse.json({ challengeId: data.id });
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const line of setCookies) {
      out.headers.append("Set-Cookie", line);
    }
    return applyTraceIdHeader(request, out);
  } catch (e) {
    return mfaFailureResponse(request, e);
  }
}
