import { NextResponse } from "next/server";
import { applyTraceIdHeader } from "@/lib/api/errors";

interface AuthErrorLike {
  message?: string;
  status?: number;
}

export function mfaFailureResponse(request: Request, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "MFA operation failed.";
  const rawStatus =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as AuthErrorLike).status === "number"
      ? (error as AuthErrorLike).status
      : undefined;
  const httpStatus =
    rawStatus !== undefined && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 400;
  return applyTraceIdHeader(
    request,
    NextResponse.json(
      { error: message, status: rawStatus ?? httpStatus },
      { status: httpStatus }
    )
  );
}
