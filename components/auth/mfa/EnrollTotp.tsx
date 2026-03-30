"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMfaError } from "./errorMessage";

interface EnrollTotpProps {
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}

function normalizeQrCodeSrc(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("<svg")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

export function EnrollTotp({ disabled, onChanged }: EnrollTotpProps) {
  const [friendlyName, setFriendlyName] = useState("Authenticator");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function beginEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: friendlyName.trim() || "Authenticator",
      });
      if (enrollError) throw enrollError;

      setFactorId(data.id);
      setQrCode(normalizeQrCodeSrc(data.totp.qr_code));
      setSecret(data.totp.secret);
    } catch (e) {
      setError(formatMfaError(e, "Could not start authenticator setup."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode.trim(),
      });
      if (verifyError) throw verifyError;

      await supabase.auth.refreshSession();

      setFactorId(null);
      setQrCode(null);
      setSecret(null);
      setVerifyCode("");
      await onChanged();
    } catch (e) {
      setError(formatMfaError(e, "Could not verify authenticator code."));
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
        Authenticator app (TOTP)
      </h3>
      <p style={{ margin: "0 0 0.6rem", fontSize: "0.82rem", color: "#666", lineHeight: 1.5 }}>
        Scan a QR code in an authenticator app (Google Authenticator, 1Password, Authy, etc.),
        then enter the 6-digit code to finish setup.
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
          <button
            type="button"
            onClick={() => void beginEnrollment()}
            disabled={disabled || busy}
            style={{
              border: "none",
              background: "#1a1a1a",
              color: "#faf8f3",
              padding: "0.5rem 0.72rem",
              cursor: disabled || busy ? "not-allowed" : "pointer",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.74rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {busy ? "Starting..." : "Start setup"}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.55rem" }}>
          {qrCode ? (
            <img
              src={qrCode}
              alt="Authenticator QR code"
              style={{ border: "1px solid #ccc", background: "#fff" }}
              width={160}
              height={160}
            />
          ) : null}
          {secret ? (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#555", lineHeight: 1.45 }}>
              Secret:{" "}
              <code style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{secret}</code>
            </p>
          ) : null}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\s+/g, ""))}
            placeholder="6-digit code"
            disabled={busy}
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
            onClick={() => void verifyEnrollment()}
            disabled={busy || verifyCode.trim().length < 6}
            style={{
              border: "none",
              background: "#1a1a1a",
              color: "#faf8f3",
              padding: "0.5rem 0.72rem",
              cursor: busy ? "wait" : verifyCode.trim().length < 6 ? "not-allowed" : "pointer",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.74rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {busy ? "Verifying..." : "Verify and enable"}
          </button>
        </div>
      )}

      {error ? (
        <p style={{ margin: "0.55rem 0 0", color: "#8b4513", fontSize: "0.8rem" }}>{error}</p>
      ) : null}
    </section>
  );
}

