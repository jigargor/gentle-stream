import { NextResponse } from "next/server";
import { isCreatorStudioSchemaUnavailableError } from "@/lib/db/creatorStudio";

export const API_ERROR_CODES = {
  BAD_GATEWAY: "ERR_BAD_GATEWAY",
  FORBIDDEN: "ERR_FORBIDDEN",
  FORBIDDEN_ORIGIN: "ERR_FORBIDDEN_ORIGIN",
  INTERNAL: "ERR_INTERNAL",
  INVALID_JSON: "ERR_INVALID_JSON",
  INVALID_REQUEST: "ERR_INVALID_REQUEST",
  MISSING_FIELD: "ERR_MISSING_FIELD",
  NOT_FOUND: "ERR_NOT_FOUND",
  RATE_LIMITED: "ERR_RATE_LIMITED",
  SERVICE_UNAVAILABLE: "ERR_SERVICE_UNAVAILABLE",
  UNAUTHORIZED: "ERR_UNAUTHORIZED",
  VALIDATION: "ERR_VALIDATION",
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  traceId: string;
  details?: unknown;
  unlockAt?: string;
  retryAfterSec?: number;
}

export interface ApiErrorInput {
  request?: Request;
  traceId?: string;
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  unlockAt?: string;
  retryAfterSec?: number;
  headers?: Record<string, string>;
}

export function getOrCreateTraceId(request?: Request): string {
  if (!request) return crypto.randomUUID();
  const incoming =
    request.headers.get("x-trace-id")?.trim() ||
    request.headers.get("x-request-id")?.trim();
  if (incoming) return incoming;
  return crypto.randomUUID();
}

export function apiErrorResponse(input: ApiErrorInput): NextResponse<ApiErrorBody> {
  const traceId = input.traceId ?? getOrCreateTraceId(input.request);
  const response = NextResponse.json(
    {
      error: input.message,
      code: input.code,
      traceId,
      ...(input.details !== undefined ? { details: input.details } : {}),
      ...(input.unlockAt ? { unlockAt: input.unlockAt } : {}),
      ...(input.retryAfterSec !== undefined ? { retryAfterSec: input.retryAfterSec } : {}),
    },
    { status: input.status }
  );
  response.headers.set("X-Trace-Id", traceId);
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) {
      response.headers.set(k, v);
    }
  }
  return response;
}

export interface InternalErrorInput {
  request?: Request;
  error?: unknown;
  status?: number;
  code?: ApiErrorCode;
  message?: string;
  headers?: Record<string, string>;
}

export function internalErrorResponse(input: InternalErrorInput): NextResponse<ApiErrorBody> {
  if (input.error !== undefined) {
    if (isCreatorStudioSchemaUnavailableError(input.error)) {
      console.warn("[api] Creator Studio schema unavailable", input.error);
      const message =
        input.error instanceof Error && input.error.name === "CreatorStudioSchemaUnavailableError"
          ? input.error.message
          : "Creator Studio tables are not available yet. Run lib/db/migrations/060_creator_studio_foundation.sql in the Supabase SQL editor, then reload the API schema cache (Project Settings → API → Reload schema).";
      return apiErrorResponse({
        request: input.request,
        status: 503,
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        message,
        headers: input.headers,
      });
    }
    console.error("[api] Internal error", input.error);
  }
  return apiErrorResponse({
    request: input.request,
    status: input.status ?? 500,
    code: input.code ?? API_ERROR_CODES.INTERNAL,
    message: input.message ?? "Internal error",
    headers: input.headers,
  });
}

export function applyTraceIdHeader<T extends NextResponse>(request: Request | undefined, response: T): T {
  response.headers.set("X-Trace-Id", getOrCreateTraceId(request));
  return response;
}
