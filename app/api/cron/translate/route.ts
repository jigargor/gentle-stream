import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { captureException, flushOnShutdown, startSpan } from "@/lib/observability";
import { runArticleTranslationNormalization } from "@/lib/translation/articleNormalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function readPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

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
    const span = startSpan("cron.translate", {
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    const maxRows = readPositiveInt(process.env.TRANSLATION_NORMALIZATION_MAX_ROWS, 40);
    const scanLimit = readPositiveInt(process.env.TRANSLATION_NORMALIZATION_SCAN_LIMIT, 900);
    const summary = await runArticleTranslationNormalization({
      maxRows,
      scanLimit,
      apply: true,
      reason: "cron_translate",
    });
    span.end({ ok: true, translated: summary.translated });
    await flushOnShutdown();
    return NextResponse.json({
      ok: true,
      ...summary,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    captureException(error, {
      route: "cron.translate",
      traceId: request.headers.get("x-trace-id") ?? undefined,
    });
    await flushOnShutdown();
    return internalErrorResponse({ request, error });
  }
}
