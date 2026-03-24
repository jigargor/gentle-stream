import { type NextRequest, NextResponse } from "next/server";
import {
  SESSION_START_COOKIE,
  sessionStartCookieOptions,
} from "@/lib/auth/session-policy";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";

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
 * OAuth (Google) and email magic links land here with ?code=...
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
      ? "magic_link_browser"
      : "auth";
    return redirectToLoginCleared(request, { error: errKey });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLoginCleared(request, { error: "auth" });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  response.cookies.set(
    SESSION_START_COOKIE,
    String(nowSec),
    sessionStartCookieOptions()
  );

  return response;
}
