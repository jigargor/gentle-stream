import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  SESSION_START_COOKIE,
  sessionStartCookieOptions,
} from "@/lib/auth/session-policy";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
import { TERMS_ACCEPTED_COOKIE } from "@/lib/legal/terms-policy";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function isPkceVerifierMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "AuthPKCECodeVerifierMissingError"
  );
}

function readPrimaryProvider(user: {
  app_metadata?: Record<string, unknown>;
}): string | null {
  const provider = user.app_metadata?.provider;
  return typeof provider === "string" && provider.length > 0 ? provider : null;
}

function hasEmailIdentity(user: {
  identities?: Array<{ provider?: string | null }>;
}): boolean {
  return (user.identities ?? []).some((identity) => identity.provider === "email");
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createSupabaseClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function isSsoEmailConflict(user: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string | null }>;
}): Promise<boolean> {
  const provider = readPrimaryProvider(user);
  if (!provider || provider === "email") return false;
  if (!user.email) return false;

  // Supabase can auto-link OAuth identities to an email/password account.
  // Product requirement: block SSO sign-in when that email already belongs to another path.
  if (hasEmailIdentity(user)) return true;

  const admin = createSupabaseAdminClient();
  if (!admin) return false;

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) {
    console.error("[/auth/callback] listUsers failed while checking SSO conflict:", error);
    return false;
  }

  const normalized = user.email.trim().toLowerCase();
  return data.users.some((candidate) => {
    const candidateEmail = candidate.email?.trim().toLowerCase();
    return candidateEmail === normalized && candidate.id !== user.id;
  });
}

/**
 * After a failed auth handoff, clear Supabase cookies on the response. Otherwise the
 * browser keeps the previous session and the user appears signed in as the wrong account.
 */
async function redirectToLoginCleared(
  request: NextRequest,
  query: Record<string, string>
): Promise<NextResponse> {
  const url = new URL("/login", request.url);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  const response = NextResponse.redirect(url);
  const supabase = createSupabaseResponseClient(request, response);
  await supabase.auth.signOut({ scope: "local" });
  response.cookies.delete(SESSION_START_COOKIE);
  return response;
}

/**
 * OAuth (Google/Facebook) and email verification links land here with ?code=...
 * Cookies must be written onto the returned redirect response (Route Handler quirk).
 *
 * Do not call signOut before exchangeCodeForSession: signOut removes the PKCE code
 * verifier from storage, so the exchange always fails and the old session remains.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return redirectToLoginCleared(request, { error: "auth" });
  }

  // Resolve against this request’s URL so host/port match the tab (never trust
  // reconstructed origins from X-Forwarded-* when those point at production).
  const destination = new URL(next, request.url);
  const response = NextResponse.redirect(destination);
  const supabase = createSupabaseResponseClient(request, response);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errKey = isPkceVerifierMissing(error)
      ? "oauth_browser"
      : "auth";
    return redirectToLoginCleared(request, { error: errKey });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLoginCleared(request, { error: "auth" });
  }

  if (await isSsoEmailConflict(user)) {
    return redirectToLoginCleared(request, { error: "sso_email_conflict" });
  }

  const provider = readPrimaryProvider(user);
  const termsAccepted = request.cookies.get(TERMS_ACCEPTED_COOKIE)?.value === "1";
  const needsTermsAccept =
    (provider === "google" || provider === "facebook") && !termsAccepted;

  if (needsTermsAccept && destination.pathname !== "/terms/accept") {
    const gateUrl = new URL("/terms/accept", request.url);
    gateUrl.searchParams.set("next", next);
    // Route Handler quirks: we start with a redirect to `next`, but then override
    // the Location header to redirect to the terms gate.
    response.headers.set("Location", gateUrl.toString());
    response.headers.set("location", gateUrl.toString());
  }

  const nowSec = Math.floor(Date.now() / 1000);
  response.cookies.set(
    SESSION_START_COOKIE,
    String(nowSec),
    sessionStartCookieOptions()
  );

  return response;
}
