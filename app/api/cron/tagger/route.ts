/**
 * GET /api/cron/tagger
 *
 * Processes up to 20 untagged articles per run.
 * Runs on a faster schedule than the scheduler (e.g. every 5 min)
 * so articles are enriched quickly after ingest.
 *
 * Protect with CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { runTaggerAgent } from "@/lib/agents/taggerAgent";
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
    await runTaggerAgent(20);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/cron/tagger] Error:", error);
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
