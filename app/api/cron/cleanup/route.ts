/**
 * GET /api/cron/cleanup
 *
 * TTL cleanup is currently disabled.
 * This route remains for operational compatibility and observability.
 *
 * Protect with CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureException, flushOnShutdown, startSpan } from "@/lib/observability";

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  try {
    const span = startSpan("cron.cleanup", {
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    console.log("[Cleanup] Skipped: article TTL cleanup is disabled");
    span.end({ skipped: true });
    await flushOnShutdown();
    return NextResponse.json({
      ok: true,
      deleted: 0,
      skipped: true,
      reason: "article TTL cleanup disabled",
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    captureException(error, {
      route: "cron.cleanup",
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    await flushOnShutdown();
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
