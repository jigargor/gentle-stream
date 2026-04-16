import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthRedirectBase } from "@/components/auth/login-form-utils";
import type {
  ApiErrorResponse,
  EmailPasswordAuthRequest,
  EmailPasswordAuthResponse,
  GuestAccessRequest,
} from "./login-contracts";

const REDIRECT_BASE_ERROR_MESSAGE =
  "Could not determine the app URL for sign-in. Set NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN (e.g. http://localhost:3000) in .env.local.";

const GENERIC_EMAIL_PASSWORD_ERROR = "Could not continue with email/password.";
const GENERIC_GUEST_ERROR = "Could not unlock guest browsing.";

interface OAuthHandlerInput {
  provider: Provider;
  authRedirectBaseFromServer: string;
  nextPath: string;
  createSupabaseClient: () => SupabaseClient;
}

interface OAuthHandlerResult {
  ok: boolean;
  errorMessage: string | null;
}

interface EmailPasswordHandlerInput {
  payload: EmailPasswordAuthRequest;
  fetchImpl?: typeof fetch;
}

interface EmailPasswordHandlerResult {
  ok: boolean;
  errorMessage: string | null;
  requiresEmailVerification: boolean;
}

interface GuestAccessHandlerInput {
  payload: GuestAccessRequest;
  fetchImpl?: typeof fetch;
}

interface GuestAccessHandlerResult {
  ok: boolean;
  errorMessage: string | null;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const body = (error ?? {}) as ApiErrorResponse;
  return body.error ?? fallback;
}

export async function signInWithOAuthRedirect(
  input: OAuthHandlerInput
): Promise<OAuthHandlerResult> {
  const base = resolveAuthRedirectBase(input.authRedirectBaseFromServer);
  if (!base) return { ok: false, errorMessage: REDIRECT_BASE_ERROR_MESSAGE };

  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(input.nextPath)}`;
  try {
    const supabase = input.createSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: input.provider,
      options: { redirectTo },
    });
    if (error) return { ok: false, errorMessage: error.message };
    return { ok: true, errorMessage: null };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Sign-in failed",
    };
  }
}

export async function submitEmailPasswordAuth(
  input: EmailPasswordHandlerInput
): Promise<EmailPasswordHandlerResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/auth/email-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    return {
      ok: false,
      errorMessage: getApiErrorMessage(body, GENERIC_EMAIL_PASSWORD_ERROR),
      requiresEmailVerification: false,
    };
  }

  const body = (await response.json().catch(() => ({}))) as EmailPasswordAuthResponse;
  return {
    ok: true,
    errorMessage: null,
    requiresEmailVerification: Boolean(body.requiresEmailVerification),
  };
}

export async function submitGuestAccess(
  input: GuestAccessHandlerInput
): Promise<GuestAccessHandlerResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/auth/guest-access", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorResponse;
    return {
      ok: false,
      errorMessage: getApiErrorMessage(body, GENERIC_GUEST_ERROR),
    };
  }

  return { ok: true, errorMessage: null };
}

export function getRedirectBaseErrorMessage(): string {
  return REDIRECT_BASE_ERROR_MESSAGE;
}
