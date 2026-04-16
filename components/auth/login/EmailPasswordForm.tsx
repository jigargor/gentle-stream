import type { FormEventHandler, RefObject } from "react";
import Script from "next/script";
import {
  getEmailModeButtonStyle,
  loginFieldInputStyle,
  loginFieldLabelStyle,
  loginIconButtonStyle,
  loginMutedHintStyle,
  loginPrimaryButtonStyle,
  LOGIN_TEXT_MUTED,
} from "./login-style-tokens";

export interface EmailPasswordFormProps {
  isCreatorLogin: boolean;
  emailMode: "sign_in" | "sign_up";
  email: string;
  password: string;
  birthDate: string;
  showPassword: boolean;
  emailBusy: boolean;
  needsTurnstileChallenge: boolean;
  turnstileToken: string | null;
  turnstileContainerRef: RefObject<HTMLDivElement | null>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTurnstileScriptLoad: () => void;
  onEmailModeChange: (value: "sign_in" | "sign_up") => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onBirthDateChange: (value: string) => void;
  onToggleShowPassword: () => void;
}

export function EmailPasswordForm({
  isCreatorLogin,
  emailMode,
  email,
  password,
  birthDate,
  showPassword,
  emailBusy,
  needsTurnstileChallenge,
  turnstileToken,
  turnstileContainerRef,
  onSubmit,
  onTurnstileScriptLoad,
  onEmailModeChange,
  onEmailChange,
  onPasswordChange,
  onBirthDateChange,
  onToggleShowPassword,
}: EmailPasswordFormProps) {
  const isTurnstileMissing = needsTurnstileChallenge && !turnstileToken;

  return (
    <form onSubmit={onSubmit}>
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
          onClick={() => onEmailModeChange("sign_in")}
          style={getEmailModeButtonStyle(emailMode === "sign_in", emailBusy)}
        >
          Sign in
        </button>
        <button
          type="button"
          disabled={emailBusy}
          onClick={() => onEmailModeChange("sign_up")}
          style={getEmailModeButtonStyle(emailMode === "sign_up", emailBusy)}
        >
          Sign up
        </button>
      </div>

      <label
        htmlFor="login-email"
        style={loginFieldLabelStyle}
      >
        Email
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        placeholder="you@example.com"
        style={{ ...loginFieldInputStyle, marginBottom: "0.5rem" }}
      />

      <label
        htmlFor="login-password"
        style={loginFieldLabelStyle}
      >
        Password
      </label>
      <div style={{ position: "relative", marginBottom: "0.5rem" }}>
        <input
          id="login-password"
          type={showPassword ? "text" : "password"}
          autoComplete={
            !isCreatorLogin && emailMode === "sign_up" ? "new-password" : "current-password"
          }
          required
          minLength={8}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="At least 8 characters"
          style={{
            ...loginFieldInputStyle,
            padding: "0.55rem 2.4rem 0.55rem 0.65rem",
          }}
        />
        <button
          type="button"
          onClick={onToggleShowPassword}
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: "0.45rem",
            top: "50%",
            transform: "translateY(-50%)",
            ...loginIconButtonStyle,
          }}
        >
          {showPassword ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path
                d="M10.58 10.58a2 2 0 102.83 2.83"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M9.36 5.95A10.86 10.86 0 0112 5.5c5.05 0 9.27 3.11 10.5 6.5a11.8 11.8 0 01-4.04 5.13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M6.23 8.22A11.8 11.8 0 001.5 12c1.23 3.39 5.45 6.5 10.5 6.5a10.86 10.86 0 004.03-.76"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M1.5 12c1.23-3.39 5.45-6.5 10.5-6.5S21.27 8.61 22.5 12c-1.23 3.39-5.45 6.5-10.5 6.5S2.73 15.39 1.5 12z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          )}
        </button>
      </div>

      {!isCreatorLogin && emailMode === "sign_up" ? (
        <>
          <label
            htmlFor="login-birthdate"
            style={loginFieldLabelStyle}
          >
            Birthdate
          </label>
          <input
            id="login-birthdate"
            type="date"
            required
            value={birthDate}
            onChange={(event) => onBirthDateChange(event.target.value)}
            style={{ ...loginFieldInputStyle, marginBottom: "0.5rem" }}
          />
        </>
      ) : null}

      <p
        style={{
          margin: "0 0 0.85rem",
          ...loginMutedHintStyle,
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
            onLoad={onTurnstileScriptLoad}
          />
          {!turnstileToken ? (
            <p
              style={{
                margin: "0 0 0.5rem",
                ...loginMutedHintStyle,
              }}
            >
              Complete the security check below before signing in.
            </p>
          ) : null}
          <div
            ref={turnstileContainerRef}
            style={{ marginBottom: "0.85rem", minHeight: "70px" }}
            aria-live="polite"
          />
        </>
      ) : null}

      <button
        type="submit"
        disabled={emailBusy || isTurnstileMissing}
        style={{
          ...loginPrimaryButtonStyle,
          padding: "0.6rem 1rem",
          cursor: emailBusy ? "wait" : isTurnstileMissing ? "not-allowed" : "pointer",
          opacity: isTurnstileMissing && !emailBusy ? 0.55 : 1,
        }}
      >
        {emailBusy
          ? "Working�"
          : isCreatorLogin
            ? "Sign in to creator account"
            : emailMode === "sign_up"
              ? "Create account"
              : "Sign in with email"}
      </button>
    </form>
  );
}
