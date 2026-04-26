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
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { captureException, flushOnShutdown, startSpan } from "@/lib/observability";
import { logError } from "@/lib/observability/logger";

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
    const span = startSpan("cron.tagger", {
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    await runTaggerAgent(20);
    span.end({ ok: true });
    await flushOnShutdown();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (error: unknown) {
    const errorMessage =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: string }).message ?? "Unknown error")
        : "Unknown error";
    logError("cron.tagger.error", {
      route: "cron.tagger",
      traceId: request.headers.get("x-trace-id") ?? undefined,
      message: errorMessage,
    }, error);
    captureException(error, {
      route: "cron.tagger",
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    await flushOnShutdown();
    return internalErrorResponse({ request, error });
  }
}
