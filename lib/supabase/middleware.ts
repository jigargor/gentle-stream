import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseEnv } from "@/lib/env";
import {
  parseSessionStart,
  SESSION_MAX_AGE_SEC,
  SESSION_START_COOKIE,
  sessionStartCookieOptions,
} from "@/lib/auth/session-policy";
import { createSupabaseResponseClient } from "@/lib/supabase/response-client";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import {
  rejectIfSupabaseKeyIsPlatformSecret,
  rejectIfSupabaseKeyIsServiceRole,
} from "./validate-anon-key";
import { GUEST_ACCESS_COOKIE, hasGuestAccessCookie } from "@/lib/auth/guest-access";

const PUBLIC_PREFIXES = [
  "/",
  "/login",
  "/creator/login",
  "/article",
  "/embed",
  "/auth/callback",
  "/auth/auth-code-error",
  "/api/auth/email-password",
  "/api/auth/email-link",
  "/api/auth/guest-access",
  "/privacy",
  "/about",
  "/terms",
  "/data-deletion",
  "/sms-consent",
  "/sms-consent-screen",
];

const PUBLIC_API_PREFIXES = [
  "/api/feed",
  "/api/feed/related",
  "/api/feed/modules",
  "/api/feedback",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function updateSession(
  request: NextRequest,
  traceId?: string,
  nonceHeader?: string
) {
  const requestTraceId = traceId ?? crypto.randomUUID();
  const nonce = nonceHeader?.trim() || request.headers.get("x-nonce")?.trim() || null;
  const forwardedHeaders = new Headers(request.headers);
  if (nonce) forwardedHeaders.set("x-nonce", nonce);
  function nextResponse() {
    return NextResponse.next({ request: { headers: forwardedHeaders } });
  }
  function finish(response: NextResponse) {
    if (nonce) response.headers.set("x-nonce", nonce);
    response.headers.set("X-Trace-Id", requestTraceId);
    return response;
  }

  const env = parseEnv(process.env);
  if (env.NODE_ENV === "production" && env.AUTH_DISABLED) {
    throw new Error("AUTH_DISABLED must never be enabled in production.");
  }
  if (env.AUTH_DISABLED) {
    return finish(nextResponse());
  }

  const { pathname } = request.nextUrl;
  const hasGuestAccess = hasGuestAccessCookie(
    request.cookies.get(GUEST_ACCESS_COOKIE)?.value ?? null
  );
  const allowsAnonymousPage =
    pathname !== "/" ? isPublicPath(pathname) : hasGuestAccess;
  const allowsAnonymousFeedApi = hasGuestAccess && isPublicApiPath(pathname);
  // Scheduled jobs use CRON_SECRET, not browser cookies
  if (pathname.startsWith("/api/cron")) {
    return finish(nextResponse());
  }

  // Browser CSP violation reports (no session cookies; must not 401)
  if (pathname === "/api/csp-report") {
    return finish(nextResponse());
  }

  // Let the Route Handler own cookie exchange; refreshing here can keep the prior session
  // while /auth/callback sets the new one, so the wrong user can appear signed in.
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")) {
    return finish(nextResponse());
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return finish(nextResponse());
  }

  rejectIfSupabaseKeyIsPlatformSecret(key);
  rejectIfSupabaseKeyIsServiceRole(key);

  let supabaseResponse = nextResponse();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowSec = Math.floor(Date.now() / 1000);
  const startRaw = request.cookies.get(SESSION_START_COOKIE)?.value;
  const started = parseSessionStart(startRaw);

  if (user) {
    if (started === null) {
      const inferredStartSec = (() => {
        const fromUser =
          (user as { last_sign_in_at?: string | null }).last_sign_in_at ??
          (user as { created_at?: string | null }).created_at ??
          null;
        if (!fromUser) return nowSec;
        const parsed = Math.floor(Date.parse(fromUser) / 1000);
        if (!Number.isFinite(parsed)) return nowSec;
        return Math.min(parsed, nowSec);
      })();
      if (nowSec - inferredStartSec > SESSION_MAX_AGE_SEC) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/login";
        redirectUrl.searchParams.set("reason", "session_expired");
        if (!isPublicPath(pathname)) {
          redirectUrl.searchParams.set("next", pathname);
        }
        const r = NextResponse.redirect(redirectUrl);
        const signOutClient = createSupabaseResponseClient(request, r);
        await signOutClient.auth.signOut();
        r.cookies.delete(SESSION_START_COOKIE);
        return finish(r);
      }
      supabaseResponse.cookies.set(
        SESSION_START_COOKIE,
        String(inferredStartSec),
        sessionStartCookieOptions()
      );
    } else if (nowSec - started > SESSION_MAX_AGE_SEC) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("reason", "session_expired");
      if (!isPublicPath(pathname)) {
        redirectUrl.searchParams.set("next", pathname);
      }
      const r = NextResponse.redirect(redirectUrl);
      const signOutClient = createSupabaseResponseClient(request, r);
      await signOutClient.auth.signOut();
      r.cookies.delete(SESSION_START_COOKIE);
      return finish(r);
    }
  }

  if (!user) {
    if (request.cookies.get(SESSION_START_COOKIE)) {
      supabaseResponse.cookies.delete(SESSION_START_COOKIE);
    }
    // Puzzle generators are public — no user data; route handlers must still run (not 401).
    const isPublicGameApi = pathname.startsWith("/api/game");
    if (
      pathname.startsWith("/api") &&
      !isPublicGameApi &&
      !allowsAnonymousFeedApi &&
      !isPublicPath(pathname)
    ) {
      return finish(
        apiErrorResponse({
          request,
          traceId: requestTraceId,
          status: 401,
          code: API_ERROR_CODES.UNAUTHORIZED,
          message: "Unauthorized",
        })
      );
    }
    if (!pathname.startsWith("/api") && !allowsAnonymousPage) {
      const redirectUrl = request.nextUrl.clone();
      const isCreatorArea = pathname.startsWith("/creator");
      redirectUrl.pathname = isCreatorArea ? "/creator/login" : "/login";
      redirectUrl.searchParams.set("next", pathname);
      return finish(NextResponse.redirect(redirectUrl));
    }
  } else if (pathname === "/login" || pathname === "/creator/login") {
    const sp = request.nextUrl.searchParams;
    if (sp.has("error") || sp.has("reason")) {
      // Stay on login so we can show auth errors / session expiry; otherwise logged-in
      // users get bounced home and never see e.g. a failed OAuth handoff message.
    } else {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = pathname === "/creator/login" ? "/creator" : "/";
      redirectUrl.searchParams.delete("next");
      return finish(NextResponse.redirect(redirectUrl));
    }
  }

  if (user) {
    const isCreatorStudioPage =
      pathname.startsWith("/creator") &&
      pathname !== "/creator/login" &&
      pathname !== "/creator/onboarding";
    const isCreatorStudioApi =
      pathname.startsWith("/api/creator") &&
      pathname !== "/api/creator/onboarding";
    if ((isCreatorStudioPage || isCreatorStudioApi) && !user.email_confirmed_at) {
      if (isCreatorStudioApi) {
        return finish(
          apiErrorResponse({
            request,
            traceId: requestTraceId,
            status: 403,
            code: API_ERROR_CODES.FORBIDDEN,
            message: "Creator Studio requires verified email.",
          })
        );
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/account/settings";
      redirectUrl.searchParams.set("reason", "creator_email_verification_required");
      return finish(NextResponse.redirect(redirectUrl));
    }
    // MFA is no longer required to access Creator Studio at the routing level.
    // Sensitive mutations (provider key saves, data export, memory wipe) enforce
    // step-up MFA individually inside their own API route handlers.
  }

  return finish(supabaseResponse);
}
