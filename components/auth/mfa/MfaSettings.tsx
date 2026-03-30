"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EnrollTotp } from "./EnrollTotp";
import { EnrollPhone } from "./EnrollPhone";
import { ListFactors, type MfaFactorRow } from "./ListFactors";
import { formatMfaError } from "./errorMessage";

interface AssuranceLevelInfo {
  currentLevel?: string | null;
  nextLevel?: string | null;
}

function friendlyAalLabel(value: string | null | undefined) {
  if (value === "aal2") return "AAL2 (MFA verified)";
  if (value === "aal1") return "AAL1 (single factor)";
  return "Unknown";
}

export function MfaSettings() {
  const PHONE_MFA_ENABLED = false;

  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [factors, setFactors] = useState<MfaFactorRow[]>([]);
  const [assurance, setAssurance] = useState<AssuranceLevelInfo>({});
  const [error, setError] = useState<string | null>(null);
  const [busyFactorId, setBusyFactorId] = useState<string | null>(null);

  const verifiedFactors = useMemo(
    () => factors.filter((factor) => factor.status === "verified"),
    [factors]
  );
  const hasVerifiedTotp = useMemo(
    () => verifiedFactors.some((factor) => factor.factor_type === "totp"),
    [verifiedFactors]
  );

  const canEnroll = emailVerified;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const [{ data: userData, error: userError }, { data: mfaData, error: mfaError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.auth.mfa.listFactors(),
        ]);

      if (userError) throw userError;
      if (mfaError) throw mfaError;

      setEmailVerified(Boolean(userData.user?.email_confirmed_at));
      setFactors([...(mfaData.totp ?? []), ...(mfaData.phone ?? [])]);

      const { data: assuranceData, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      setAssurance({
        currentLevel: assuranceData.currentLevel,
        nextLevel: assuranceData.nextLevel,
      });
    } catch (e) {
      setError(formatMfaError(e, "Could not load MFA settings."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleUnenroll(factorId: string) {
    setBusyFactorId(factorId);
    setError(null);
    try {
      const supabase = createClient();
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) throw unenrollError;
      await supabase.auth.refreshSession();
      await reload();
    } catch (e) {
      setError(formatMfaError(e, "Could not remove factor."));
    } finally {
      setBusyFactorId(null);
    }
  }

  return (
    <section style={{ marginTop: "1.4rem" }}>
      <h2 style={{ marginTop: 0, fontSize: "1.15rem" }}>Security (MFA)</h2>

      <p style={{ margin: "0.45rem 0 0.6rem", color: "#555", lineHeight: 1.5 }}>
        Multi-factor authentication adds a second verification step after sign-in.
      </p>

      {loading ? (
        <p style={{ margin: 0, color: "#777", fontSize: "0.85rem" }}>Loading MFA settings...</p>
      ) : null}

      {error ? (
        <p style={{ margin: "0.4rem 0", color: "#8b4513", fontSize: "0.82rem" }}>{error}</p>
      ) : null}

      {!loading ? (
        <div
          style={{
            border: "1px solid #d8d2c7",
            background: "#fff",
            padding: "0.75rem",
            marginBottom: "0.8rem",
          }}
        >
          <p style={{ margin: "0 0 0.25rem", color: "#555", fontSize: "0.82rem" }}>
            Email verification:{" "}
            <strong style={{ color: emailVerified ? "#1a472a" : "#8b4513" }}>
              {emailVerified ? "Verified" : "Not verified"}
            </strong>
          </p>
          <p style={{ margin: "0 0 0.25rem", color: "#555", fontSize: "0.82rem" }}>
            Session assurance: <strong>{friendlyAalLabel(assurance.currentLevel)}</strong>
          </p>
          <p style={{ margin: 0, color: "#555", fontSize: "0.82rem" }}>
            Next assurance if challenged:{" "}
            <strong>{friendlyAalLabel(assurance.nextLevel)}</strong>
          </p>
        </div>
      ) : null}

      <div style={{ marginBottom: "1rem" }}>
        <h3
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.95rem",
            margin: "0 0 0.45rem",
          }}
        >
          Enrolled factors
        </h3>
        <ListFactors
          factors={factors}
          onUnenroll={handleUnenroll}
          busyFactorId={busyFactorId}
        />
        {verifiedFactors.length > 0 ? (
          <p style={{ margin: "0.45rem 0 0", color: "#555", fontSize: "0.82rem" }}>
            MFA enforcement is active for your account. Future sign-ins will require factor
            verification.
          </p>
        ) : (
          <p style={{ margin: "0.45rem 0 0", color: "#777", fontSize: "0.82rem" }}>
            No verified factors yet. Your account stays on single-factor sign-in.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gap: "0.8rem" }}>
        {!canEnroll ? (
          <p style={{ margin: 0, color: "#8b4513", fontSize: "0.82rem" }}>
            Verify your email address before enrolling MFA factors.
          </p>
        ) : null}

        {hasVerifiedTotp ? (
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
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#666", lineHeight: 1.5 }}>
              You already have a verified authenticator factor. Remove it from the enrolled
              factors list above before adding another.
            </p>
          </section>
        ) : (
          <EnrollTotp disabled={!canEnroll} onChanged={reload} />
        )}

        {!PHONE_MFA_ENABLED ? (
          <p style={{ margin: 0, color: "#777", fontSize: "0.82rem" }}>
            Phone MFA (SMS/WhatsApp) is temporarily disabled.
          </p>
        ) : null}
        <EnrollPhone disabled={!canEnroll || !PHONE_MFA_ENABLED} onChanged={reload} />
      </div>
    </section>
  );
}

