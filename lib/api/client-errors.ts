export interface ApiClientError {
  message: string;
  code: string;
  traceId?: string;
  unlockAt?: string;
  retryAfterSec?: number;
  details?: unknown;
  status: number;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function parseApiClientError(response: Response): Promise<ApiClientError> {
  const fallbackMessage =
    response.status >= 500
      ? "Something went wrong. Please try again."
      : "Request failed.";

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // no-op: non-json response
  }

  const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const message = toStringOrNull(rec.error) ?? fallbackMessage;
  const code = toStringOrNull(rec.code) ?? "ERR_UNKNOWN";
  const traceId = toStringOrNull(rec.traceId) ?? undefined;
  const unlockAt = toStringOrNull(rec.unlockAt) ?? undefined;
  const retryAfterSec = typeof rec.retryAfterSec === "number" ? rec.retryAfterSec : undefined;
  const details = rec.details;

  return {
    message,
    code,
    traceId,
    unlockAt,
    retryAfterSec,
    details,
    status: response.status,
  };
}

export function formatApiClientError(error: ApiClientError): string {
  switch (error.code) {
    case "ERR_RATE_LIMITED":
      if (error.retryAfterSec && error.retryAfterSec > 0)
        return `Too many requests. Try again in about ${error.retryAfterSec}s.`;
      return "Too many requests. Please try again shortly.";
    case "ERR_UNAUTHORIZED":
      return "Please sign in and try again.";
    case "ERR_FORBIDDEN":
    case "ERR_FORBIDDEN_ORIGIN":
      return "You do not have permission to perform this action.";
    default: {
      if (!error.traceId) return error.message;
      return `${error.message} (Ref: ${error.traceId})`;
    }
  }
}
