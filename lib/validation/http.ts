import { NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

export function badRequest(
  message: string,
  details?: unknown,
  request?: Request
) {
  return apiErrorResponse({
    request,
    status: 400,
    code: API_ERROR_CODES.VALIDATION,
    message,
    details,
  });
}

export async function parseJsonBody<T extends z.ZodTypeAny>(input: {
  request: Request;
  schema: T;
  errorMessage?: string;
}): Promise<
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await input.request.json();
  } catch {
    return {
      ok: false,
      response: apiErrorResponse({
        request: input.request,
        status: 400,
        code: API_ERROR_CODES.INVALID_JSON,
        message: input.errorMessage ?? "Invalid JSON body.",
      }),
    };
  }
  const parsed = input.schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: badRequest(
        input.errorMessage ?? "Invalid request body.",
        parsed.error.flatten(),
        input.request
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export function parseQuery<T extends z.ZodTypeAny>(input: {
  request?: Request;
  query: Record<string, unknown>;
  schema: T;
  errorMessage?: string;
}): { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse } {
  const parsed = input.schema.safeParse(input.query);
  if (!parsed.success) {
    return {
      ok: false,
      response: badRequest(
        input.errorMessage ?? "Invalid query params.",
        parsed.error.flatten(),
        input.request
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
