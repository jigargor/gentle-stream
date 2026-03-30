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
    console.log("[Cleanup] Skipped: article TTL cleanup is disabled");
    return NextResponse.json({
      ok: true,
      deleted: 0,
      skipped: true,
      reason: "article TTL cleanup disabled",
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
