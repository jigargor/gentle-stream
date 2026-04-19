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

const completeBodySchema = z
  .object({
    factorId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
    challengeId: z.string().uuid().optional(),
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
    schema: completeBodySchema,
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
    policy: { id: "auth-mfa-complete", windowMs: 10 * 60 * 1000, max: 60 },
    key: buildRateLimitKey({
      request,
      userId: user.id,
      routeId: "auth-mfa-complete",
    }),
  });
  if (!rate.allowed) return rateLimitExceededResponse(rate, request);

  const { factorId, code, challengeId } = parsedBody.data;

  try {
    if (challengeId) {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });
      if (verifyError) throw verifyError;
    } else {
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) throw verifyError;
    }

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;

    return applyTraceIdHeader(request, response);
  } catch (e) {
    return mfaFailureResponse(request, e);
  }
}
