"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Provider } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { CREATOR_LOGIN_ENABLED } from "@/lib/feature-flags/regulatory";
import {
  getTurnstileApi,
  resolveAuthRedirectBase,
  safeNextPath,
} from "@/components/auth/login-form-utils";
import {
  CreatorAccessSection,
  CreatorLoginDisabledScreen,
  CreatorOnboardingNoticeDialog,
  EmailModeDivider,
  EmailPasswordForm,
  EmailVerificationPanel,
  GuestAccessSection,
  LoginAlerts,
  LoginFooterLinks,
  LoginLegalNotice,
  LoginShell,
  OAuthButtons,
  getRedirectBaseErrorMessage,
  signInWithOAuthRedirect,
  submitEmailPasswordAuth,
  submitGuestAccess,
  type EmailPasswordAuthRequest,
  LOGIN_TEXT_MUTED,
  loginWarningTextStyle,
} from "@/components/auth/login";

/**
 * OAuth / email-verification `redirect_to` must match this tab exactly (scheme + host + port).
 * PKCE stores the code verifier in cookies for that origin; if `redirectTo` points elsewhere
 * (e.g. server hinted `http://localhost:3000` while you use a LAN IP), Supabase sends you
 * to the wrong host, the exchange fails, and you can end up on production with no session.
 *
 * In the browser we always use `window.location.origin` so the address bar wins.
 */

export interface LoginFormProps {
  /** From server: OAuth/email-verification return origin (dev defaults to http://localhost:3000). */
  authRedirectBaseFromServer?: string;
  audience?: "subscriber" | "creator";
  /** From `?next=` - passed by the server page to avoid `useSearchParams` + Suspense chunk issues in dev. */
  initialNext?: string | null;
  initialAuthError?: string | null;
  /** From `?reason=session_expired` after max session age. */
  initialSessionExpired?: boolean;
  /** From `?error=oauth_browser` - PKCE verifier missing (wrong browser / app). */
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
  const nextPath = useMemo(() => safeNextPath(initialNext ?? null), [initialNext]);
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
  const [guestBusy, setGuestBusy] = useState(false);
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

  async function signInWithOAuth(provider: Provider) {
    setMessage(null);
    setOauthBusy(true);
    setOauthProvider(provider);
    const result = await signInWithOAuthRedirect({
      provider,
      authRedirectBaseFromServer,
      nextPath,
      createSupabaseClient: createClient,
    });
    if (!result.ok) {
      setMessage(result.errorMessage ?? "Sign-in failed");
      setOauthBusy(false);
      setOauthProvider(null);
    }
  }

  async function submitEmailPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.trim().length < 8) {
      setMessage("Use at least 8 characters for your password.");
      return;
    }

    if (needsTurnstileChallenge) {
      const formData = new FormData(event.currentTarget);
      const token = (formData.get("cf-turnstile-response") as string | null)?.trim() ?? "";
      if (!token) {
        setMessage("Please complete the security verification below.");
        return;
      }
    }

    setEmailBusy(true);
    try {
      const formData = new FormData(event.currentTarget);
      const turnstileResponseToken =
        (formData.get("cf-turnstile-response") as string | null)?.trim() ?? "";
      const base = resolveAuthRedirectBase(authRedirectBaseFromServer);
      if (!base) {
        setMessage(getRedirectBaseErrorMessage());
        return;
      }

      const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      const payload: EmailPasswordAuthRequest = {
        email: email.trim(),
        password,
        mode: isCreatorLogin ? "sign_in" : emailMode,
        audience,
        birthDate,
        redirectTo,
        turnstileToken: turnstileResponseToken,
      };
      const result = await submitEmailPasswordAuth({ payload });
      if (!result.ok) {
        setMessage(result.errorMessage ?? "Could not continue with email/password.");
        resetTurnstileWidget();
        return;
      }
      if (emailMode === "sign_up" || result.requiresEmailVerification) {
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

  async function continueAsGuest() {
    setMessage(null);
    if (needsTurnstileChallenge && !turnstileToken) {
      setMessage("Please complete the security verification below.");
      return;
    }
    setGuestBusy(true);
    try {
      const result = await submitGuestAccess({
        payload: { turnstileToken: turnstileToken ?? "" },
      });
      if (!result.ok) {
        setMessage(result.errorMessage ?? "Could not unlock guest browsing.");
        resetTurnstileWidget();
        return;
      }
      window.location.assign(nextPath || "/");
    } finally {
      setGuestBusy(false);
    }
  }

  if (isCreatorLoginDisabled) return <CreatorLoginDisabledScreen />;

  return (
    <>
      <LoginShell isCreatorLogin={isCreatorLogin}>
        <LoginAlerts
          initialSessionExpired={initialSessionExpired}
          initialOauthBrowserError={initialOauthBrowserError}
          authError={authError}
        />

        <LoginLegalNotice />

        <OAuthButtons
          isCreatorLogin={isCreatorLogin}
          oauthBusy={oauthBusy}
          oauthProvider={oauthProvider}
          onSignInWithOAuth={(provider) => {
            void signInWithOAuth(provider);
          }}
        />

        <EmailModeDivider isCreatorLogin={isCreatorLogin} />

        {requiresEmailVerification ? (
          <EmailVerificationPanel
            onBackToSignIn={() => {
              setRequiresEmailVerification(false);
              setEmailMode("sign_in");
            }}
          />
        ) : (
          <EmailPasswordForm
            isCreatorLogin={isCreatorLogin}
            emailMode={emailMode}
            email={email}
            password={password}
            birthDate={birthDate}
            showPassword={showPassword}
            emailBusy={emailBusy}
            needsTurnstileChallenge={needsTurnstileChallenge}
            turnstileToken={turnstileToken}
            turnstileContainerRef={turnstileContainerRef}
            onSubmit={submitEmailPassword}
            onTurnstileScriptLoad={() => setTurnstileScriptReady(true)}
            onEmailModeChange={setEmailMode}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onBirthDateChange={setBirthDate}
            onToggleShowPassword={() => setShowPassword((value) => !value)}
          />
        )}

        {message ? (
          <p
            style={{
              ...loginWarningTextStyle,
              margin: "1rem 0 0",
            }}
          >
            {message}
          </p>
        ) : null}

        <GuestAccessSection
          isCreatorLogin={isCreatorLogin}
          needsTurnstileChallenge={needsTurnstileChallenge}
          turnstileToken={turnstileToken}
          guestBusy={guestBusy}
          onContinueAsGuest={() => {
            void continueAsGuest();
          }}
          loginTextMuted={LOGIN_TEXT_MUTED}
        />

        <CreatorAccessSection
          isCreatorLogin={isCreatorLogin}
          loginTextMuted={LOGIN_TEXT_MUTED}
          onOpenNotice={() => setShowCreatorOnboardingNotice(true)}
        />

        <LoginFooterLinks />
      </LoginShell>

      <CreatorOnboardingNoticeDialog
        isOpen={showCreatorOnboardingNotice}
        onClose={() => setShowCreatorOnboardingNotice(false)}
      />
    </>
  );
}
