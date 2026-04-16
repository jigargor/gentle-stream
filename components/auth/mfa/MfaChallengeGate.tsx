"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMfaError } from "./errorMessage";

interface FactorChoice {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
  phone?: string | null;
}

interface MfaChallengeGateProps {
  onPassed: () => void;
}

export function MfaChallengeGate({ onPassed }: MfaChallengeGateProps) {
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSubmittedCodeRef = useRef<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const onPassedRef = useRef(onPassed);
  onPassedRef.current = onPassed;

  const startChallenge = useCallback(async (factorId: string) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) throw challengeError;
      setChallengeId(data.id);
    } catch (e) {
      setError(formatMfaError(e, "Could not create MFA challenge."));
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyChallenge = useCallback(
    async (rawCode: string) => {
      if (!selectedFactorId || !challengeId || rawCode.length !== 6) return;
      setBusy(true);
      setError(null);
      try {
        const supabase = createClient();
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: selectedFactorId,
          challengeId,
          code: rawCode,
        });
        if (verifyError) throw verifyError;

        await supabase.auth.refreshSession();
        onPassedRef.current();
      } catch (e) {
        // Keep autoSubmittedCodeRef set to the code we already attempted so the
        // auto-submit effect does not immediately call verify again (same 6 digits,
        // busy flips false) — that caused a /verify storm and Supabase 429s.
        setError(formatMfaError(e, "MFA verification failed."));
      } finally {
        setBusy(false);
      }
    },
    [challengeId, selectedFactorId]
  );

  const init = useCallback(async () => {
    setChecking(true);
    setError(null);
    setChallengeId(null);
    setCode("");
    autoSubmittedCodeRef.current = null;
    try {
      const supabase = createClient();
      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;
      const needsMfa =
        aalData.nextLevel === "aal2" && aalData.currentLevel !== "aal2";
      if (!needsMfa) {
        onPassedRef.current();
        return;
      }

      const { data: factorData, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const verified = [...(factorData.totp ?? []), ...(factorData.phone ?? [])].filter(
        (factor) => factor.status === "verified"
      );
      if (verified.length === 0) {
        setRequired(true);
        setError(
          "This account requires MFA, but no verified factors were found. Re-enroll MFA from Account settings."
        );
        return;
      }
      const ordered = [...verified].sort((a, b) => {
        if (a.factor_type === b.factor_type) return 0;
        if (a.factor_type === "totp") return -1;
        if (b.factor_type === "totp") return 1;
        return 0;
      });
      const factorId = ordered[0]?.id ?? null;
      if (!factorId) {
        setRequired(true);
        setError("Could not resolve an MFA factor for this account.");
        return;
      }
      setRequired(true);
      setSelectedFactorId(factorId);
      await startChallenge(factorId);
    } catch (e) {
      setRequired(true);
      setError(formatMfaError(e, "Could not validate MFA requirement."));
    } finally {
      setChecking(false);
    }
  }, [startChallenge]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const normalizedCode = code.trim();
    if (normalizedCode.length !== 6 || !challengeId || busy) return;
    if (autoSubmittedCodeRef.current === normalizedCode) return;
    autoSubmittedCodeRef.current = normalizedCode;
    void verifyChallenge(normalizedCode);
  }, [busy, challengeId, code, verifyChallenge]);

  useEffect(() => {
    if (checking || busy || !challengeId) return;
    codeInputRef.current?.focus();
  }, [busy, challengeId, checking]);

  if (!required && !checking) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--gs-bg)",
        padding: "2rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--gs-surface-elevated)",
          border: "1px solid var(--gs-border-strong)",
          borderRadius: "var(--gs-radius-lg)",
          boxShadow: "var(--gs-shadow-overlay)",
          padding: "1.5rem 1.2rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.9rem",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "var(--gs-text)",
            lineHeight: 1.5,
            fontSize: "1rem",
            textAlign: "center",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
        >
          Enter the passcode from your authenticator app to log in to Gentle Stream
        </p>
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "320px",
            alignSelf: "center",
          }}
        >
          <input
            ref={codeInputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => {
              const digitsOnly = event.target.value.replace(/\D+/g, "").slice(0, 6);
              autoSubmittedCodeRef.current = null;
              setCode(digitsOnly);
              setError(null);
            }}
            aria-label="One-time code"
            disabled={checking || busy || !challengeId}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid var(--gs-border)",
              background: "var(--gs-surface)",
              color: "transparent",
              caretColor: "transparent",
              padding: "0.6rem 0.75rem",
              fontSize: "1.12rem",
              textAlign: "center",
              letterSpacing: "0.36em",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              borderRadius: "var(--gs-radius-sm)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.34rem",
              pointerEvents: "none",
              fontSize: "1.12rem",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {Array.from({ length: 6 }).map((_, index) => {
              const digit = code[index] ?? "_";
              const hasDigit = index < code.length;
              return (
                <span
                  key={`otp-slot-${index}`}
                  style={{
                    color: hasDigit ? "var(--gs-ink-strong)" : "var(--gs-muted)",
                    opacity: hasDigit ? 1 : 0.68,
                  }}
                >
                  {digit}
                </span>
              );
            })}
          </div>
        </div>
        {busy ? (
          <p
            style={{
              margin: 0,
              color: "var(--gs-muted)",
              textAlign: "center",
              fontSize: "0.82rem",
            }}
          >
            Verifying...
          </p>
        ) : null}
        {error ? (
          <p
            style={{
              margin: 0,
              color: "var(--gs-warning)",
              fontSize: "0.82rem",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

