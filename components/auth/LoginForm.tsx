"use client";

import { useMemo, useState } from "react";
import Script from "next/script";
import type { Provider } from "@supabase/supabase-js";
import { AppLogo } from "@/components/brand/AppLogo";
import { createClient } from "@/lib/supabase/client";

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
function resolveAuthRedirectBase(serverHint: string): string {
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");

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
  const [emailMode, setEmailMode] = useState<"sign_in" | "sign_up">("sign_in");
  /** Clickwrap: required before OAuth or email auth (unchecked by default). */
  const [legalConsentAccepted, setLegalConsentAccepted] = useState(false);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<Provider | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const turnstileEnabled =
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "1" ||
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
  const [showCreatorOnboardingNotice, setShowCreatorOnboardingNotice] = useState(false);

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

    if (!legalConsentAccepted) {
      setMessage("Please agree to the Terms and Privacy Policy before continuing.");
      return;
    }
    if (password.trim().length < 8) {
      setMessage("Use at least 8 characters for your password.");
      return;
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
          mode: emailMode,
          redirectTo,
          turnstileToken,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error ?? "Could not continue with email/password.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        requiresEmailVerification?: boolean;
      };
      if (emailMode === "sign_up" || body.requiresEmailVerification) {
        setRequiresEmailVerification(true);
        setPassword("");
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
          Gentle Stream
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
          Sign in to read your personalised feed.
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

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.45rem",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.78rem",
            color: "#555",
            lineHeight: 1.5,
            marginBottom: "1rem",
          }}
        >
          <input
            type="checkbox"
            checked={legalConsentAccepted}
            onChange={(e) => setLegalConsentAccepted(e.target.checked)}
            style={{ marginTop: "0.18rem" }}
          />
          <span>
            I have read and agree to the{" "}
            <a href="/terms" style={{ color: "#5c4a32" }}>
              Terms of service
            </a>{" "}
            and{" "}
            <a href="/privacy" style={{ color: "#5c4a32" }}>
              Privacy policy
            </a>
            . For email login or signup, you must agree before continuing.
            <span style={{ display: "block", marginTop: "0.25rem", color: "#777" }}>
              Google/Facebook sign-in prompts agreement on a follow-up screen.
            </span>
          </span>
        </label>

        <button
          type="button"
          disabled={oauthBusy}
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
          }}
        >
          {oauthBusy && oauthProvider === "google"
            ? "Redirecting…"
            : "Continue with Google"}
        </button>

        <button
          type="button"
          disabled={oauthBusy}
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
          }}
        >
          {oauthBusy && oauthProvider === "facebook"
            ? "Redirecting…"
            : `Continue with ${providerLabel("facebook")}`}
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            margin: "0 0 1.25rem",
            color: "#aaa",
            fontSize: "0.7rem",
            fontFamily: "'IM Fell English', Georgia, serif",
          }}
        >
          <span style={{ flex: 1, height: "1px", background: "#ddd" }} />
          or use email
          <span style={{ flex: 1, height: "1px", background: "#ddd" }} />
        </div>

        {requiresEmailVerification ? (
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
            Check your inbox to verify your email, then sign in with your password.
          </p>
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
                color: "#888",
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
                color: "#888",
                marginBottom: "0.35rem",
              }}
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete={emailMode === "sign_up" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
            <p
              style={{
                margin: "0 0 0.85rem",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.72rem",
                color: "#777",
                lineHeight: 1.45,
              }}
            >
              {emailMode === "sign_up"
                ? "We will create your account and send a verification email through Supabase before your first password login."
                : "Use the password linked to your account."}
            </p>

            <button
              type="submit"
              disabled={emailBusy || !legalConsentAccepted}
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
                cursor: emailBusy ? "wait" : !legalConsentAccepted ? "not-allowed" : "pointer",
                opacity: legalConsentAccepted ? 1 : 0.6,
              }}
            >
              {emailBusy
                ? "Working…"
                : emailMode === "sign_up"
                  ? "Create account"
                  : "Sign in with email"}
            </button>

            {turnstileEnabled && turnstileSiteKey ? (
              <>
                <Script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                  async
                  defer
                />
                <div
                  className="cf-turnstile"
                  data-sitekey={turnstileSiteKey}
                  data-theme="light"
                  style={{ marginTop: "0.85rem" }}
                />
              </>
            ) : null}
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
              color: "#888",
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
              Sign up & onboarding
            </button>
            <span style={{ color: "#bbb", margin: "0 0.35rem" }} aria-hidden>
              ·
            </span>
            <a
              href={`/login?next=${encodeURIComponent("/creator")}`}
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
              color: "#999",
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
            color: "#999",
          }}
        >
          <a href="/privacy" style={{ color: "#777", textDecoration: "underline" }}>
            Privacy
          </a>
          {" · "}
          <a href="/terms" style={{ color: "#777", textDecoration: "underline" }}>
            Terms
          </a>
          {" · "}
          <a
            href="/data-deletion"
            style={{ color: "#777", textDecoration: "underline" }}
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
              Please log into your regular account first using Google, Facebook, or
              email/password. After login, continue to creator onboarding from your account.
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
