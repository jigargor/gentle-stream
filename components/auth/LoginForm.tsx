"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export interface LoginFormProps {
  /** From `?next=` — passed by the server page to avoid `useSearchParams` + Suspense chunk issues in dev. */
  initialNext?: string | null;
  initialAuthError?: string | null;
  /** From `?reason=session_expired` after max session age. */
  initialSessionExpired?: boolean;
  /** From `?error=magic_link_browser` — PKCE verifier missing (wrong browser / app). */
  initialMagicLinkBrowserError?: boolean;
}

export function LoginForm({
  initialNext = null,
  initialAuthError = null,
  initialSessionExpired = false,
  initialMagicLinkBrowserError = false,
}: LoginFormProps) {
  const nextPath = useMemo(
    () => safeNextPath(initialNext ?? null),
    [initialNext]
  );
  const authError = initialAuthError;

  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  async function signInWithGoogle() {
    setMessage(null);
    setOauthBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setMessage(error.message);
    } finally {
      setOauthBusy(false);
    }
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setEmailBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setEmailSent(true);
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

  return (
    <div style={shell}>
      <div style={card}>
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

        {initialMagicLinkBrowserError && (
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
            This sign-in link must be opened in the{" "}
            <strong>same browser</strong> where you clicked &quot;Email me a sign-in
            link&quot; (same profile on this device). In-app mail apps often open links
            elsewhere, which cannot complete the handoff. We signed you out here so you
            are not left in another user&apos;s session by mistake.
          </p>
        )}

        {authError && !initialMagicLinkBrowserError && (
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.82rem",
              color: "#8b4513",
              margin: "0 0 1rem",
              textAlign: "center",
            }}
          >
            Sign-in did not complete. Please try again.
          </p>
        )}

        <button
          type="button"
          disabled={oauthBusy}
          onClick={() => void signInWithGoogle()}
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
            marginBottom: "1.25rem",
          }}
        >
          {oauthBusy ? "Redirecting…" : "Continue with Google"}
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

        {emailSent ? (
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
            Check your inbox for a sign-in link. You can close this tab.
          </p>
        ) : (
          <form onSubmit={signInWithEmail}>
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
                marginBottom: "0.85rem",
              }}
            />
            <button
              type="submit"
              disabled={emailBusy}
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
                cursor: emailBusy ? "wait" : "pointer",
              }}
            >
              {emailBusy ? "Sending…" : "Email me a sign-in link"}
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
      </div>
    </div>
  );
}
