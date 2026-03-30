"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

function factorName(factor: FactorChoice) {
  if (factor.friendly_name?.trim()) return factor.friendly_name.trim();
  if (factor.factor_type === "totp") return "Authenticator app";
  if (factor.factor_type === "phone") return factor.phone ?? "Phone code";
  return factor.factor_type;
}

export function MfaChallengeGate({ onPassed }: MfaChallengeGateProps) {
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [factors, setFactors] = useState<FactorChoice[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const selectedFactor = useMemo(
    () => factors.find((factor) => factor.id === selectedFactorId) ?? null,
    [factors, selectedFactorId]
  );

  const init = useCallback(async () => {
    setChecking(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;

      const needsMfa =
        aalData.nextLevel === "aal2" && aalData.currentLevel !== "aal2";
      if (!needsMfa) {
        onPassed();
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

      setFactors(ordered);
      setSelectedFactorId(ordered[0].id);
      setRequired(true);
    } catch (e) {
      // Fail closed: if check cannot complete, do not allow app access.
      setRequired(true);
      setError(formatMfaError(e, "Could not validate MFA requirement."));
    } finally {
      setChecking(false);
    }
  }, [onPassed]);

  useEffect(() => {
    void init();
  }, [init]);

  async function startChallenge() {
    if (!selectedFactorId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { data, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: selectedFactorId,
      });
      if (challengeError) throw challengeError;

      setChallengeId(data.id);
      if (selectedFactor?.factor_type === "phone") {
        setInfo("We sent a verification code to your enrolled phone factor.");
      } else {
        setInfo("Enter the current code from your authenticator app.");
      }
    } catch (e) {
      setError(formatMfaError(e, "Could not create MFA challenge."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyChallenge() {
    if (!selectedFactorId || !challengeId) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: selectedFactorId,
        challengeId,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();
      onPassed();
    } catch (e) {
      setError(formatMfaError(e, "MFA verification failed."));
    } finally {
      setBusy(false);
    }
  }

  if (!required && !checking) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ede9e1",
        padding: "2rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#faf8f3",
          borderTop: "3px double #1a1a1a",
          borderBottom: "2px solid #1a1a1a",
          boxShadow: "0 0 40px rgba(0,0,0,0.08)",
          padding: "1.4rem 1.2rem",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.25rem",
            color: "#0d0d0d",
          }}
        >
          Security verification
        </h2>
        <p
          style={{
            margin: "0.45rem 0 0.9rem",
            color: "#555",
            lineHeight: 1.5,
            fontSize: "0.88rem",
          }}
        >
          {checking
            ? "Checking account security requirements..."
            : "This account requires MFA verification before continuing."}
        </p>

        {!checking && factors.length > 0 ? (
          <>
            <label
              style={{
                display: "block",
                marginBottom: "0.35rem",
                fontSize: "0.75rem",
                color: "#777",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Factor
            </label>
            <select
              value={selectedFactorId ?? ""}
              onChange={(e) => {
                setSelectedFactorId(e.target.value);
                setChallengeId(null);
                setCode("");
                setInfo(null);
              }}
              disabled={busy}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #ccc",
                background: "#fff",
                padding: "0.5rem",
                fontSize: "0.9rem",
                marginBottom: "0.6rem",
              }}
            >
              {factors.map((factor) => (
                <option key={factor.id} value={factor.id}>
                  {factorName(factor)}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: "0.45rem", marginBottom: "0.6rem" }}>
              <button
                type="button"
                onClick={() => void startChallenge()}
                disabled={busy || !selectedFactorId}
                style={{
                  border: "1px solid #1a1a1a",
                  background: "#fff",
                  color: "#1a1a1a",
                  padding: "0.48rem 0.64rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {challengeId ? "Resend challenge" : "Start challenge"}
              </button>
            </div>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
              placeholder="Enter MFA code"
              disabled={busy || !challengeId}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #ccc",
                background: challengeId ? "#fff" : "#f4f1ea",
                padding: "0.5rem",
                fontSize: "0.92rem",
              }}
            />
            <button
              type="button"
              onClick={() => void verifyChallenge()}
              disabled={busy || !challengeId || code.trim().length < 6}
              style={{
                width: "100%",
                marginTop: "0.6rem",
                border: "none",
                background: "#1a1a1a",
                color: "#faf8f3",
                padding: "0.56rem 0.74rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor:
                  busy || !challengeId || code.trim().length < 6
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {busy ? "Verifying..." : "Verify and continue"}
            </button>
          </>
        ) : null}

        {info ? <p style={{ margin: "0.6rem 0 0", color: "#555", fontSize: "0.82rem" }}>{info}</p> : null}
        {error ? (
          <p style={{ margin: "0.6rem 0 0", color: "#8b4513", fontSize: "0.82rem" }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}

