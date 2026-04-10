import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { insertSiteFeedback } from "@/lib/db/siteFeedback";
import { captureMessage } from "@/lib/observability";
import {
  API_ERROR_CODES,
  apiErrorResponse,
  getOrCreateTraceId,
} from "@/lib/api/errors";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  pageUrl: z.string().url().max(2000).optional().nullable(),
  contactEmail: z.string().email().max(320).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const traceId = getOrCreateTraceId(request);

  const rateLimit = await consumeRateLimit({
    policy: { id: "site-feedback", windowMs: 3_600_000, max: 8 },
    key: buildRateLimitKey({ request, routeId: "api-feedback" }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiErrorResponse({
      request,
      traceId,
      status: 400,
      code: API_ERROR_CODES.INVALID_JSON,
      message: "Invalid JSON body.",
    });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiErrorResponse({
      request,
      traceId,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Invalid feedback payload.",
      details: parsed.error.flatten(),
    });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ua = request.headers.get("user-agent");

  try {
    const { id } = await insertSiteFeedback({
      message: parsed.data.message,
      pageUrl: parsed.data.pageUrl ?? null,
      contactEmail: parsed.data.contactEmail ?? null,
      userAgent: ua,
      userId: user?.id ?? null,
    });

    captureMessage({
      level: "info",
      message: "site_feedback.received",
      context: { id, hasEmail: Boolean(parsed.data.contactEmail), userId: user?.id ?? null },
    });

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (e) {
    console.error("[api/feedback]", e);
    return apiErrorResponse({
      request,
      traceId,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: "Could not save feedback.",
    });
  }
}
