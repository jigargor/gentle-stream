"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import type { Provider } from "@supabase/supabase-js";
import { AppLogo } from "@/components/brand/AppLogo";
import { createClient } from "@/lib/supabase/client";
import { CREATOR_LOGIN_ENABLED } from "@/lib/feature-flags/regulatory";

/** Secondary text on login shell `#faf8f3` — WCAG AA for normal-sized copy (contrast ≥ 4.5:1). */
const LOGIN_TEXT_MUTED = "#454545";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/**
 * OAuth / email-verification `redirect_to` must match this tab exactly (scheme + host + port).
 * PKCE stores the code verifier in cookies for that origin; if `redirectTo` points elsewhere
 * (e.g. server hinted `http://localhost:3000` while you use a LAN IP), Supabase sends you
 * to the wrong host, the exchange fails, and you can end up on production with no session.
 *
 * In the browser we always use `window.location.origin` so the address bar wins.
 */
interface CloudflareTurnstileApi {
  render: (
    container: HTMLElement | string,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

function getTurnstileApi(): CloudflareTurnstileApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { turnstile?: CloudflareTurnstileApi }).turnstile;
}

function resolveAuthRedirectBase(serverHint: string): string {
  if (typeof window !== "undefined") {
    const origin = window.location?.origin ?? "";
    if (origin) return origin.replace(/\/$/, "");
  }

  const trimmed = serverHint.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  const fromEnv =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim().replace(/\/$/, "") ??
    "";
  if (fromEnv) return fromEnv;
  return "";
}

export interface LoginFormProps {
  /** From server: OAuth/email-verification return origin (dev defaults to http://localhost:3000). */
  authRedirectBaseFromServer?: string;
  audience?: "subscriber" | "creator";
  /** From `?next=` — passed by the server page to avoid `useSearchParams` + Suspense chunk issues in dev. */
  initialNext?: string | null;
  initialAuthError?: string | null;
  /** From `?reason=session_expired` after max session age. */
  initialSessionExpired?: boolean;
  /** From `?error=oauth_browser` — PKCE verifier missing (wrong browser / app). */
  initialOauthBrowserError?: boolean;
}

export function LoginForm({
  authRedirectBaseFromServer = "",
  audience = "subscriber",
  initialNext = null,
  initialAuthError = null,
  initialSessionExpired = false,
  initialOauthBrowserError = false,
}: LoginFormProps) {
  const nextPath = useMemo(
    () => safeNextPath(initialNext ?? null),
    [initialNext]
  );
  const authError = initialAuthError;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailMode, setEmailMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [birthDate, setBirthDate] = useState("");
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<Provider | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const turnstileEnabled =
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "1" ||
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
  const needsTurnstileChallenge = turnstileEnabled && Boolean(turnstileSiteKey);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const turnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [showCreatorOnboardingNotice, setShowCreatorOnboardingNotice] = useState(false);
  const isCreatorLogin = audience === "creator";
  const isCreatorLoginDisabled = isCreatorLogin && !CREATOR_LOGIN_ENABLED;

  useEffect(() => {
    if (getTurnstileApi()) setTurnstileScriptReady(true);
  }, []);

  useEffect(() => {
    if (!needsTurnstileChallenge || requiresEmailVerification) {
      setTurnstileToken(null);
      return;
    }
    if (!turnstileScriptReady || !turnstileContainerRef.current) return;

    const container = turnstileContainerRef.current;
    const api = getTurnstileApi();
    if (!api) return;

    container.innerHTML = "";
    const widgetId = api.render(container, {
      sitekey: turnstileSiteKey,
      theme: "light",
      callback: (token: string) => {
        setTurnstileToken(token.trim() ? token.trim() : null);
      },
      "expired-callback": () => setTurnstileToken(null),
      "error-callback": () => setTurnstileToken(null),
    });
    turnstileWidgetIdRef.current = widgetId;

    return () => {
      const id = turnstileWidgetIdRef.current;
      turnstileWidgetIdRef.current = null;
      setTurnstileToken(null);
      if (id) {
        try {
          api.remove(id);
        } catch {
          /* ignore */
        }
      }
      container.innerHTML = "";
    };
  }, [
    needsTurnstileChallenge,
    requiresEmailVerification,
    turnstileScriptReady,
    turnstileSiteKey,
  ]);

  function resetTurnstileWidget() {
    const id = turnstileWidgetIdRef.current;
    const api = getTurnstileApi();
    if (id && api) {
      try {
        api.reset(id);
      } catch {
        /* ignore */
      }
    }
    setTurnstileToken(null);
  }

  /**
   * Do not call signOut before OAuth: signOut removes the PKCE code_verifier from
   * cookie storage; the server callback needs that verifier for exchangeCodeForSession.
   * A successful exchange replaces any prior session.
   */
  function providerLabel(provider: Provider): string {
    if (provider === "facebook") return "Facebook";
    return "Google";
  }

  async function signInWithOAuth(provider: Provider) {
    setMessage(null);
    setOauthBusy(true);
    setOauthProvider(provider);
    try {
      const base = resolveAuthRedirectBase(authRedirectBaseFromServer);
      if (!base) {
        setMessage(
          "Could not determine the app URL for sign-in. Set NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN (e.g. http://localhost:3000) in .env.local."
        );
        setOauthBusy(false);
        setOauthProvider(null);
        return;
      }
      const supabase = createClient();
      const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) {
        setMessage(error.message);
        setOauthBusy(false);
        setOauthProvider(null);
        return;
      }
      // Browser navigates to OAuth provider; avoid racing state updates.
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in failed");
      setOauthBusy(false);
      setOauthProvider(null);
    }
  }

  async function submitEmailPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    if (password.trim().length < 8) {
      setMessage("Use at least 8 characters for your password.");
      return;
    }

    if (needsTurnstileChallenge) {
      const fd = new FormData(e.currentTarget);
      const token =
        (fd.get("cf-turnstile-response") as string | null)?.trim() ?? "";
      if (!token) {
        setMessage("Please complete the security verification below.");
        return;
      }
    }

    setEmailBusy(true);
    try {
      const base = resolveAuthRedirectBase(authRedirectBaseFromServer);
      if (!base) {
        setMessage(
          "Could not determine the app URL for sign-in. Set NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN (e.g. http://localhost:3000) in .env.local."
        );
        return;
      }
      const formData = new FormData(e.currentTarget);
      const turnstileToken =
        (formData.get("cf-turnstile-response") as string | null)?.trim() ?? "";
      const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const res = await fetch("/api/auth/email-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          mode: isCreatorLogin ? "sign_in" : emailMode,
          audience,
          birthDate,
          redirectTo,
          turnstileToken,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error ?? "Could not continue with email/password.");
        resetTurnstileWidget();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        requiresEmailVerification?: boolean;
      };
      if (emailMode === "sign_up" || body.requiresEmailVerification) {
        setRequiresEmailVerification(true);
        setPassword("");
        setShowPassword(false);
        return;
      }
      window.location.assign(nextPath);
    } finally {
      setEmailBusy(false);
    }
  }

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ede9e1",
    padding: "1.5rem",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: "400px",
    background: "#faf8f3",
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    boxShadow: "0 0 40px rgba(0,0,0,0.08)",
    padding: "2rem 1.75rem",
  };

  const emailModeButtonBase: React.CSSProperties = {
    flex: 1,
    border: "1px solid #1a1a1a",
    padding: "0.45rem 0.55rem",
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "0.74rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    cursor: emailBusy ? "wait" : "pointer",
  };

  if (isCreatorLoginDisabled) {
    return (
      <div style={shell}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.35rem" }}>
            <AppLogo heightPx={40} priority />
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.65rem",
              fontWeight: 700,
              margin: "0 0 0.35rem",
              color: "#0d0d0d",
              textAlign: "center",
            }}
          >
            Creator login
          </h1>
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "0.92rem",
              color: "#8b4513",
              textAlign: "center",
              margin: "0 0 1.1rem",
              lineHeight: 1.5,
            }}
          >
            Creator login is a work in progress and is temporarily disabled pending approval
            from the appropriate regulatory agencies.
          </p>
          <p
            style={{
              margin: 0,
              textAlign: "center",
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#555",
            }}
          >
            You can continue using subscriber login from{" "}
            <a href="/login" style={{ color: "#1a472a", textDecoration: "underline" }}>
              the main sign-in page
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.35rem" }}>
          <AppLogo heightPx={40} priority />
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.65rem",
            fontWeight: 700,
            margin: "0 0 0.35rem",
            color: "#0d0d0d",
            textAlign: "center",
          }}
        >
          {isCreatorLogin ? "Creator login" : "Gentle Stream"}
        </h1>
        <p
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.88rem",
            color: "#666",
            textAlign: "center",
            margin: "0 0 1.75rem",
            lineHeight: 1.45,
          }}
        >
          {isCreatorLogin
            ? "Sign in to access creator tools. Creator accounts require verified phone and email."
            : "Sign in to read your personalised feed."}
        </p>

        {initialSessionExpired && (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#8b4513",
              margin: "0 0 1rem",
              textAlign: "center",
            }}
          >
            Your session expired after two hours. Sign in again to continue.
          </p>
        )}

        {initialOauthBrowserError && (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#8b4513",
              margin: "0 0 1rem",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            This OAuth sign-in must be completed in the <strong>same browser</strong> where
            you started it. In-app mail apps often open links in a different browser profile,
            which cannot complete the secure handoff.
          </p>
        )}

        {authError && !initialOauthBrowserError && (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#8b4513",
              margin: "0 0 1rem",
              textAlign: "center",
            }}
          >
            {authError === "sso_email_conflict"
              ? "This email already belongs to an existing account. For security, social sign-in is blocked for that email. Sign in with email/password instead."
              : "Sign-in did not complete. Please try again."}
          </p>
        )}

        <p
          style={{
            margin: "0 0 1rem",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.78rem",
            color: "#555",
            lineHeight: 1.5,
          }}
        >
          By creating an account, you will review and accept our{" "}
          <a href="/terms" style={{ color: "#5c4a32" }}>
            Terms of service
          </a>{" "}
          and{" "}
          <a href="/privacy" style={{ color: "#5c4a32" }}>
            Privacy policy
          </a>{" "}
          after signup.
        </p>

        <button
          type="button"
          disabled={oauthBusy || isCreatorLogin}
          onClick={() => void signInWithOAuth("google")}
          style={{
            width: "100%",
            padding: "0.65rem 1rem",
            border: "1px solid #1a1a1a",
            background: "#fff",
            color: "#1a1a1a",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.8rem",
            letterSpacing: "0.04em",
            cursor: oauthBusy ? "wait" : "pointer",
            opacity: 1,
            marginBottom: "0.6rem",
            display: isCreatorLogin ? "none" : "block",
          }}
        >
          {oauthBusy && oauthProvider === "google"
            ? "Redirecting…"
            : "Continue with Google"}
        </button>

        <button
          type="button"
          disabled={oauthBusy || isCreatorLogin}
          onClick={() => void signInWithOAuth("facebook")}
          style={{
            width: "100%",
            padding: "0.65rem 1rem",
            border: "1px solid #1a1a1a",
            background: "#fff",
            color: "#1a1a1a",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.8rem",
            letterSpacing: "0.04em",
            cursor: oauthBusy ? "wait" : "pointer",
            opacity: 1,
            marginBottom: "1.25rem",
            display: isCreatorLogin ? "none" : "block",
          }}
        >
          {oauthBusy && oauthProvider === "facebook"
            ? "Redirecting…"
            : `Continue with ${providerLabel("facebook")}`}
        </button>

        <Link
          href="/?guest=1"
          style={{
            display: isCreatorLogin ? "none" : "block",
            width: "100%",
            boxSizing: "border-box",
            marginBottom: "1.25rem",
            textAlign: "center",
            padding: "0.58rem 1rem",
            border: "1px solid #b7b2a8",
            background: "#f5f1e8",
            color: "#3d3b35",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.78rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          Continue as guest
        </Link>

        <div
          style={{
            display: isCreatorLogin ? "none" : "flex",
            alignItems: "center",
            gap: "0.75rem",
            margin: "0 0 1.25rem",
            color: LOGIN_TEXT_MUTED,
            fontSize: "0.7rem",
            fontFamily: "'IM Fell English', Georgia, serif",
          }}
        >
          <span style={{ flex: 1, height: "1px", background: "#ddd" }} />
          or use email
          <span style={{ flex: 1, height: "1px", background: "#ddd" }} />
        </div>

        {requiresEmailVerification ? (
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <p
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.88rem",
                color: "#1a472a",
                textAlign: "center",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Account created. We sent a verification email via Supabase. You can sign in now with
              your email and password.
            </p>
            <button
              type="button"
              onClick={() => {
                setRequiresEmailVerification(false);
                setEmailMode("sign_in");
              }}
              style={{
                width: "100%",
                padding: "0.56rem 1rem",
                border: "1px solid #1a1a1a",
                background: "#fff",
                color: "#1a1a1a",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.75rem",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submitEmailPassword}>
            <div
              style={{
                display: "flex",
                gap: "0.4rem",
                marginBottom: "0.65rem",
              }}
            >
              <button
                type="button"
                disabled={emailBusy}
                onClick={() => setEmailMode("sign_in")}
                style={{
                  ...emailModeButtonBase,
                  background: emailMode === "sign_in" ? "#1a1a1a" : "#fff",
                  color: emailMode === "sign_in" ? "#faf8f3" : "#1a1a1a",
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={emailBusy}
                onClick={() => setEmailMode("sign_up")}
                style={{
                  ...emailModeButtonBase,
                  background: emailMode === "sign_up" ? "#1a1a1a" : "#fff",
                  color: emailMode === "sign_up" ? "#faf8f3" : "#1a1a1a",
                }}
              >
                Sign up
              </button>
            </div>

            <label
              htmlFor="login-email"
              style={{
                display: "block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: LOGIN_TEXT_MUTED,
                marginBottom: "0.35rem",
              }}
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.55rem 0.65rem",
                border: "1px solid #ccc",
                background: "#fff",
                fontFamily: "Georgia, serif",
                fontSize: "0.95rem",
                marginBottom: "0.5rem",
              }}
            />

            <label
              htmlFor="login-password"
              style={{
                display: "block",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: LOGIN_TEXT_MUTED,
                marginBottom: "0.35rem",
              }}
            >
              Password
            </label>
            <div style={{ position: "relative", marginBottom: "0.5rem" }}>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete={!isCreatorLogin && emailMode === "sign_up" ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.55rem 2.4rem 0.55rem 0.65rem",
                  border: "1px solid #ccc",
                  background: "#fff",
                  fontFamily: "Georgia, serif",
                  fontSize: "0.95rem",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "0.45rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "#666",
                  cursor: "pointer",
                  padding: "0.2rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M10.58 10.58a2 2 0 102.83 2.83" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M9.36 5.95A10.86 10.86 0 0112 5.5c5.05 0 9.27 3.11 10.5 6.5a11.8 11.8 0 01-4.04 5.13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M6.23 8.22A11.8 11.8 0 001.5 12c1.23 3.39 5.45 6.5 10.5 6.5a10.86 10.86 0 004.03-.76" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M1.5 12c1.23-3.39 5.45-6.5 10.5-6.5S21.27 8.61 22.5 12c-1.23 3.39-5.45 6.5-10.5 6.5S2.73 15.39 1.5 12z" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                )}
              </button>
            </div>
            {!isCreatorLogin && emailMode === "sign_up" ? (
              <>
                <label
                  htmlFor="login-birthdate"
                  style={{
                    display: "block",
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.72rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: LOGIN_TEXT_MUTED,
                    marginBottom: "0.35rem",
                  }}
                >
                  Birthdate
                </label>
                <input
                  id="login-birthdate"
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.55rem 0.65rem",
                    border: "1px solid #ccc",
                    background: "#fff",
                    fontFamily: "Georgia, serif",
                    fontSize: "0.95rem",
                    marginBottom: "0.5rem",
                  }}
                />
              </>
            ) : null}

            <p
              style={{
                margin: "0 0 0.85rem",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.72rem",
                color: LOGIN_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              {isCreatorLogin
                ? "Creator accounts require verified email and verified phone before access."
                : emailMode === "sign_up"
                  ? "We will create your account and send a verification email through Supabase. You can still sign in with password right away."
                  : "Use the password linked to your account."}
            </p>

            {needsTurnstileChallenge ? (
              <>
                <Script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                  async
                  defer
                  onLoad={() => setTurnstileScriptReady(true)}
                />
                <p
                  style={{
                    margin: "0 0 0.5rem",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontSize: "0.72rem",
                    color: LOGIN_TEXT_MUTED,
                    lineHeight: 1.45,
                  }}
                >
                  Complete the security check below before signing in.
                </p>
                <div
                  ref={turnstileContainerRef}
                  style={{ marginBottom: "0.85rem", minHeight: "70px" }}
                  aria-live="polite"
                />
              </>
            ) : null}

            <button
              type="submit"
              disabled={
                emailBusy || (needsTurnstileChallenge && !turnstileToken)
              }
              style={{
                width: "100%",
                padding: "0.6rem 1rem",
                border: "none",
                background: "#1a1a1a",
                color: "#faf8f3",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor:
                  emailBusy
                    ? "wait"
                    : needsTurnstileChallenge && !turnstileToken
                      ? "not-allowed"
                      : "pointer",
                opacity:
                  needsTurnstileChallenge && !turnstileToken && !emailBusy
                    ? 0.55
                    : 1,
              }}
            >
              {emailBusy
                ? "Working…"
                : isCreatorLogin
                  ? "Sign in to creator account"
                  : emailMode === "sign_up"
                    ? "Create account"
                    : "Sign in with email"}
            </button>
          </form>
        )}

        {message && (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#8b4513",
              margin: "1rem 0 0",
              textAlign: "center",
            }}
          >
            {message}
          </p>
        )}

        <div
          style={{
            display: isCreatorLogin ? "none" : "block",
            margin: "1.35rem 0 0",
            paddingTop: "1.1rem",
            borderTop: "1px solid #e0dcd4",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: "0 0 0.45rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.68rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: LOGIN_TEXT_MUTED,
            }}
          >
            Creators
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#555",
              lineHeight: 1.55,
            }}
          >
            <button
              type="button"
              onClick={() => setShowCreatorOnboardingNotice(true)}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Creator access (work in progress)
            </button>
            <span style={{ color: LOGIN_TEXT_MUTED, margin: "0 0.35rem" }} aria-hidden>
              ·
            </span>
            <a
              href={`/creator/login?next=${encodeURIComponent("/creator")}`}
              style={{
                color: "#1a472a",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              Creator studio
            </a>
          </p>
          <p
            style={{
              margin: "0.4rem 0 0",
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.72rem",
              color: LOGIN_TEXT_MUTED,
              lineHeight: 1.45,
            }}
          >
            This sets where you go after sign-in (Google, Facebook, or email/password). Stay
            on this page and complete sign-in above.
          </p>
        </div>

        <p
          style={{
            margin: "1.35rem 0 0",
            textAlign: "center",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.72rem",
            color: LOGIN_TEXT_MUTED,
          }}
        >
          <a href="/about" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
            About
          </a>
          {" · "}
          <a href="/privacy" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
            Privacy
          </a>
          {" · "}
          <a href="/terms" style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}>
            Terms
          </a>
          {" · "}
          <a
            href="/data-deletion"
            style={{ color: LOGIN_TEXT_MUTED, textDecoration: "underline" }}
          >
            Data deletion
          </a>
        </p>
      </div>
      {showCreatorOnboardingNotice && (
        <div
          role="presentation"
          onClick={() => setShowCreatorOnboardingNotice(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 60,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-onboarding-notice-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#faf8f3",
              borderTop: "3px double #1a1a1a",
              borderBottom: "2px solid #1a1a1a",
              boxShadow: "0 18px 45px rgba(0,0,0,0.2)",
              padding: "1.35rem 1.25rem",
            }}
          >
            <h2
              id="creator-onboarding-notice-title"
              style={{
                margin: 0,
                color: "#1a1a1a",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.1rem",
              }}
            >
              Log in first
            </h2>
            <p
              style={{
                margin: "0.7rem 0 0",
                color: "#555",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.92rem",
                lineHeight: 1.5,
              }}
            >
              Creator onboarding and creator login are temporarily disabled while we wait for
              approval from the appropriate regulatory agencies. This area is a work in progress.
            </p>
            <button
              type="button"
              onClick={() => setShowCreatorOnboardingNotice(false)}
              style={{
                marginTop: "1rem",
                width: "100%",
                padding: "0.58rem 1rem",
                border: "none",
                background: "#1a1a1a",
                color: "#faf8f3",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.78rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

















