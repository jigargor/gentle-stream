"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMfaError } from "./errorMessage";

interface EnrollPhoneProps {
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}

export function EnrollPhone({ disabled, onChanged }: EnrollPhoneProps) {
  const [friendlyName, setFriendlyName] = useState("Phone");
  const [phone, setPhone] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function enrollPhone() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "phone",
        phone: phone.trim(),
        friendlyName: friendlyName.trim() || "Phone",
      });
      if (enrollError) throw enrollError;

      setFactorId(data.id);

      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: data.id });
      if (challengeError) throw challengeError;

      setChallengeId(challengeData.id);
    } catch (e) {
      setError(formatMfaError(e, "Could not start phone MFA setup."));
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!factorId) return;
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
      setError(formatMfaError(e, "Could not resend verification code."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhoneFactor() {
    if (!factorId || !challengeId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: verifyCode.trim(),
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();

      setFactorId(null);
      setChallengeId(null);
      setVerifyCode("");
      setPhone("");
      await onChanged();
    } catch (e) {
      setError(formatMfaError(e, "Could not verify phone code."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid #d8d2c7",
        background: "#fff",
        padding: "0.8rem",
      }}
    >
      <h3
        style={{
          margin: "0 0 0.35rem",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.95rem",
        }}
      >
        Phone code (SMS/WhatsApp)
      </h3>
      <p style={{ margin: "0 0 0.6rem", fontSize: "0.82rem", color: "#666", lineHeight: 1.5 }}>
        Enter a phone number in E.164 format (example: +15551234567). We send a code that you
        must verify to enable this factor.
      </p>

      {!factorId ? (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <input
            type="text"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            placeholder="Friendly name"
            disabled={disabled || busy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #ccc",
              padding: "0.45rem 0.5rem",
              fontSize: "0.86rem",
            }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+15551234567"
            disabled={disabled || busy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #ccc",
              padding: "0.45rem 0.5rem",
              fontSize: "0.86rem",
            }}
          />
          <button
            type="button"
            onClick={() => void enrollPhone()}
            disabled={disabled || busy || phone.trim().length < 8}
            style={{
              border: "none",
              background: "#1a1a1a",
              color: "#faf8f3",
              padding: "0.5rem 0.72rem",
              cursor:
                disabled || busy || phone.trim().length < 8 ? "not-allowed" : "pointer",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.74rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {busy ? "Sending..." : "Send code"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\s+/g, ""))}
            placeholder="Enter verification code"
            disabled={disabled || busy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #ccc",
              padding: "0.45rem 0.5rem",
              fontSize: "0.86rem",
            }}
          />
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void verifyPhoneFactor()}
              disabled={disabled || busy || verifyCode.trim().length < 6}
              style={{
                border: "none",
                background: "#1a1a1a",
                color: "#faf8f3",
                padding: "0.5rem 0.72rem",
                cursor:
                  disabled || busy || verifyCode.trim().length < 6
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.74rem",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {busy ? "Verifying..." : "Verify and enable"}
            </button>
            <button
              type="button"
              onClick={() => void resendCode()}
              disabled={disabled || busy}
              style={{
                border: "1px solid #1a1a1a",
                background: "#fff",
                color: "#1a1a1a",
                padding: "0.48rem 0.68rem",
                cursor: disabled ? "not-allowed" : busy ? "wait" : "pointer",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Resend code
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p style={{ margin: "0.55rem 0 0", color: "#8b4513", fontSize: "0.8rem" }}>{error}</p>
      ) : null}
    </section>
  );
}

