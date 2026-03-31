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

const PUBLIC_PREFIXES = [
  "/login",
  "/auth/callback",
  "/auth/auth-code-error",
  "/api/auth/email-password",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/sms-consent",
  "/sms-consent-screen",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function updateSession(request: NextRequest, traceId?: string) {
  const requestTraceId = traceId ?? crypto.randomUUID();
  function finish(response: NextResponse) {
    response.headers.set("X-Trace-Id", requestTraceId);
    return response;
  }

  const env = parseEnv(process.env);
  if (env.NODE_ENV === "production" && env.AUTH_DISABLED) {
    throw new Error("AUTH_DISABLED must never be enabled in production.");
  }
  if (env.AUTH_DISABLED) {
    return finish(NextResponse.next({ request }));
  }

  const { pathname } = request.nextUrl;
  // Scheduled jobs use CRON_SECRET, not browser cookies
  if (pathname.startsWith("/api/cron")) {
    return finish(NextResponse.next({ request }));
  }

  // Let the Route Handler own cookie exchange; refreshing here can keep the prior session
  // while /auth/callback sets the new one, so the wrong user can appear signed in.
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")) {
    return finish(NextResponse.next({ request }));
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return finish(NextResponse.next({ request }));
  }

  rejectIfSupabaseKeyIsPlatformSecret(key);
  rejectIfSupabaseKeyIsServiceRole(key);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
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
    if (
      started !== null &&
      nowSec - started > SESSION_MAX_AGE_SEC
    ) {
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

    if (startRaw && started === null) {
      supabaseResponse.cookies.delete(SESSION_START_COOKIE);
    }
    const hasValidStart =
      started !== null && nowSec - started <= SESSION_MAX_AGE_SEC;
    if (!hasValidStart) {
      supabaseResponse.cookies.set(
        SESSION_START_COOKIE,
        String(nowSec),
        sessionStartCookieOptions()
      );
    }
  }

  if (!user) {
    if (request.cookies.get(SESSION_START_COOKIE)) {
      supabaseResponse.cookies.delete(SESSION_START_COOKIE);
    }
    // Puzzle generators are public — no user data; route handlers must still run (not 401).
    const isPublicGameApi = pathname.startsWith("/api/game");
    if (pathname.startsWith("/api") && !isPublicGameApi && !isPublicPath(pathname)) {
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
    if (!isPublicPath(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", pathname);
      return finish(NextResponse.redirect(redirectUrl));
    }
  } else if (pathname === "/login") {
    const sp = request.nextUrl.searchParams;
    if (sp.has("error") || sp.has("reason")) {
      // Stay on login so we can show auth errors / session expiry; otherwise logged-in
      // users get bounced home and never see e.g. a failed OAuth handoff message.
    } else {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.searchParams.delete("next");
      return finish(NextResponse.redirect(redirectUrl));
    }
  }

  return finish(supabaseResponse);
}
