"use client";

interface MaybeAuthApiError {
  message?: string;
  status?: number;
  code?: string;
}

export function formatMfaError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const candidate = error as Error & MaybeAuthApiError;
  const base = candidate.message?.trim() || fallback;

  if (candidate.status === 401 || candidate.code === "401")
    return "Your session is not valid for MFA actions. Sign in again and retry.";

  if (candidate.status === 422 || candidate.code === "422")
    return `${base} (Supabase returned 422. Verify Auth > Multi-factor is enabled and phone provider settings are configured for phone MFA.)`;

  if (candidate.status === 429 || candidate.code === "429")
    return "Too many attempts. Wait briefly, then try again.";

  return base;
}

