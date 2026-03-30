"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";

interface CreatorOnboardingFormProps {
  initialPhone: string;
  /** Supabase already has a confirmed phone — skip SMS steps. */
  initialPhoneConfirmed?: boolean;
}

function parseCommaTags(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Supabase Auth expects E.164 (+country, then digits). Sending anything else often yields 422.
 */
function normalizePhoneE164(input: string):
  | { ok: true; e164: string }
  | { ok: false; message: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a phone number." };
  }
  const collapsed = trimmed.replace(/[\s().-]/g, "");
  const digitsOnly = collapsed.replace(/\D/g, "");

  if (collapsed.startsWith("+")) {
    const e164 = `+${digitsOnly}`;
    if (!/^\+[1-9]\d{6,14}$/.test(e164)) {
      return {
        ok: false,
        message:
          "Invalid phone: after +, use a country code and 7–15 digits total (E.164).",
      };
    }
    return { ok: true, e164 };
  }

  if (digitsOnly.length === 10) {
    return { ok: true, e164: `+1${digitsOnly}` };
  }

  return {
    ok: false,
    message:
      "Use international format with + and country code (e.g. +44 7911 123456). US/Canada: 10 digits without + is OK.",
  };
}

/** US/CA national 10 digits → (555) 123-4567 while typing. */
function formatUsNationalDigits(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Pretty-print for the input: US/CA without + as (555) 123-4567;
 * +1… as +1 (555) 123-4567; other +country as spaced digit groups.
 */
function formatPhoneInput(value: string): string {
  const v = value.trim();
  if (!v) return "";

  if (v.startsWith("+")) {
    const digits = v.slice(1).replace(/\D/g, "").slice(0, 15);
    if (digits.length === 0) return "+";

    const isNanp =
      digits.startsWith("1") &&
      digits.length <= 11 &&
      (digits.length === 1 || digits.length >= 4);

    if (isNanp) {
      if (digits.length === 1) return "+1";
      const national = digits.slice(1);
      return `+1 ${formatUsNationalDigits(national)}`;
    }

    // + then exactly 10 digits (e.g. "+(555) 123-4567" paste) → assume +1 NANP.
    if (digits.length === 10 && /^[2-9]\d{9}$/.test(digits)) {
      return `+1 ${formatUsNationalDigits(digits)}`;
    }

    return `+${digits.replace(/(\d{3})(?=\d)/g, "$1 ").trimEnd()}`;
  }

  const digits = v.replace(/\D/g, "").slice(0, 10);
  return formatUsNationalDigits(digits);
}

export function CreatorOnboardingForm({
  initialPhone,
  initialPhoneConfirmed = false,
}: CreatorOnboardingFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState(() => formatPhoneInput(initialPhone));
  const [otpToken, setOtpToken] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  /** True after OTP is sent; shows step 2 (enter code). */
  const [otpSent, setOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(initialPhoneConfirmed);
  const [penName, setPenName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [locale, setLocale] = useState("global");
  const [timezone, setTimezone] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [consentOptIn, setConsentOptIn] = useState(false);
  const [consentProof, setConsentProof] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      isPhoneVerified &&
      penName.trim().length > 0 &&
      guidelinesAccepted &&
      consentOptIn &&
      consentProof.trim().length > 0
    );
  }, [consentOptIn, consentProof, guidelinesAccepted, isPhoneVerified, penName]);

  async function sendPhoneOtp(isResend = false) {
    setMessage(null);
    const normalized = normalizePhoneE164(phone);
    if (!normalized.ok) {
      setMessage(normalized.message);
      return;
    }
    setPhoneBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ phone: normalized.e164 });
      if (error) {
        const extra =
          /invalid|phone|format|422/i.test(error.message)
            ? " Enable Phone in Supabase (Authentication → Providers) and connect Twilio/MessageBird. Number must be E.164 (e.g. +15551234567)."
            : "";
        setMessage(`${error.message}${extra}`);
        return;
      }
      setPhone(formatPhoneInput(normalized.e164));
      setOtpSent(true);
      setOtpToken("");
      if (isResend) setMessage("A new OTP has been sent.");
    } finally {
      setPhoneBusy(false);
    }
  }

  function handleUseDifferentNumber() {
    setOtpSent(false);
    setOtpToken("");
    setMessage(null);
  }

  async function verifyPhoneOtp() {
    setMessage(null);
    const normalized = normalizePhoneE164(phone);
    if (!normalized.ok) {
      setMessage(normalized.message);
      return;
    }
    setPhoneBusy(true);
    try {
      const supabase = createClient();
      const token = otpToken.trim();
      const phoneValue = normalized.e164;
      const firstAttempt = await supabase.auth.verifyOtp({
        phone: phoneValue,
        token,
        type: "phone_change",
      });
      if (firstAttempt.error) {
        const secondAttempt = await supabase.auth.verifyOtp({
          phone: phoneValue,
          token,
          type: "sms",
        });
        if (secondAttempt.error) {
          setMessage(secondAttempt.error.message);
          return;
        }
      }
      setIsPhoneVerified(true);
      setOtpSent(false);
      setMessage(null);
    } finally {
      setPhoneBusy(false);
    }
  }

  async function saveOnboarding() {
    if (!canSubmit) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/creator/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          penName,
          bio,
          interestCategories: selectedCategories,
          websiteUrl,
          locale,
          timezone,
          guidelinesAccepted,
          consentOptIn,
          consentProof,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not finish onboarding.");
        return;
      }
      router.push("/creator");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1.2rem 0.9rem 2rem" }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
        <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.5rem" }}>
          Creator onboarding
        </h1>
        <p style={{ margin: "0.4rem 0 1rem", color: "#555", fontFamily: "'IM Fell English', Georgia, serif" }}>
          {isPhoneVerified
            ? "Complete your creator profile, then you can submit stories for review."
            : "First verify your phone number. After that, you’ll set your creator profile."}
        </p>

        {!isPhoneVerified ? (
          <section style={{ borderTop: "1px solid #ddd", paddingTop: "0.9rem" }}>
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1rem",
                fontFamily: "'Playfair Display', Georgia, serif",
              }}
            >
              Verify phone number
            </h2>
            {!otpSent ? (
              <div style={{ display: "grid", gap: "0.5rem", maxWidth: "420px" }}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                  inputMode="tel"
                  disabled={phoneBusy}
                  style={{ padding: "0.45rem", border: "1px solid #bbb" }}
                />
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.75rem",
                    color: "#666",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    lineHeight: 1.4,
                  }}
                >
                  Use a full international number (E.164). US/Canada: 10 digits is fine; other
                  countries: start with + and country code. 422 errors are usually a bad format
                  or Phone/SMS not configured in the Supabase dashboard.
                </p>
                <button
                  type="button"
                  onClick={() => void sendPhoneOtp()}
                  disabled={phoneBusy}
                  style={{
                    padding: "0.45rem",
                    border: "1px solid #777",
                    background: "#fff",
                    cursor: phoneBusy ? "wait" : "pointer",
                  }}
                >
                  {phoneBusy ? "Sending…" : "Send OTP"}
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem", maxWidth: "420px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.85rem",
                    color: "#333",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    lineHeight: 1.45,
                  }}
                >
                  We sent a code to{" "}
                  <strong style={{ fontFamily: "Georgia, serif" }}>{phone}</strong>. Enter it
                  below to confirm your number.
                </p>
                <button
                  type="button"
                  onClick={handleUseDifferentNumber}
                  disabled={phoneBusy}
                  style={{
                    justifySelf: "start",
                    padding: "0.2rem 0",
                    border: "none",
                    background: "none",
                    color: "#1a472a",
                    cursor: phoneBusy ? "not-allowed" : "pointer",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontSize: "0.8rem",
                    textDecoration: "underline",
                    textUnderlineOffset: "2px",
                  }}
                >
                  Use a different number
                </button>
                <button
                  type="button"
                  onClick={() => void sendPhoneOtp(true)}
                  disabled={phoneBusy}
                  style={{
                    justifySelf: "start",
                    padding: "0.2rem 0",
                    border: "none",
                    background: "none",
                    color: "#1a472a",
                    cursor: phoneBusy ? "not-allowed" : "pointer",
                    fontFamily: "'IM Fell English', Georgia, serif",
                    fontSize: "0.8rem",
                    textDecoration: "underline",
                    textUnderlineOffset: "2px",
                  }}
                >
                  {phoneBusy ? "Resending..." : "Resend code"}
                </button>
                <input
                  value={otpToken}
                  onChange={(e) => setOtpToken(e.target.value)}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  disabled={phoneBusy}
                  style={{ padding: "0.45rem", border: "1px solid #bbb" }}
                />
                <button
                  type="button"
                  onClick={verifyPhoneOtp}
                  disabled={phoneBusy || otpToken.trim().length < 4}
                  style={{
                    padding: "0.45rem",
                    border: "1px solid #1a472a",
                    background: "#fff",
                    cursor: phoneBusy ? "wait" : "pointer",
                  }}
                >
                  {phoneBusy ? "Checking…" : "Confirm code"}
                </button>
              </div>
            )}
          </section>
        ) : initialPhoneConfirmed ? (
          <section
            style={{
              borderTop: "1px solid #ddd",
              paddingTop: "0.9rem",
              marginBottom: "0.25rem",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.88rem",
                color: "#1a472a",
                fontFamily: "'IM Fell English', Georgia, serif",
              }}
            >
              Phone number on your account is already verified — continue to your profile below.
            </p>
          </section>
        ) : null}

        {isPhoneVerified ? (
        <section style={{ borderTop: "1px solid #ddd", marginTop: "0.9rem", paddingTop: "0.9rem" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>
            Creator profile
          </h2>
          <div style={{ display: "grid", gap: "0.5rem", maxWidth: "520px" }}>
            <input value={penName} onChange={(e) => setPenName(e.target.value)} placeholder="Pen name" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio (optional)" style={{ minHeight: "80px", padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="Website URL (optional)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="Locale (default global)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Timezone (optional)" style={{ padding: "0.45rem", border: "1px solid #bbb" }} />

            <label style={{ fontSize: "0.88rem", color: "#555" }}>Interest categories</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {CATEGORIES.map((category) => {
                const selected = selectedCategories.includes(category);
                return (
                  <button
                    key={category}
                    onClick={() =>
                      setSelectedCategories((prev) =>
                        selected ? prev.filter((c) => c !== category) : [...prev, category]
                      )
                    }
                    style={{
                      padding: "0.3rem 0.5rem",
                      border: selected ? "1px solid #1a472a" : "1px solid #bbb",
                      background: selected ? "#eaf4ed" : "#fff",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                    }}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
              <input
                type="checkbox"
                checked={guidelinesAccepted}
                onChange={(e) => setGuidelinesAccepted(e.target.checked)}
              />
              I agree to submit original, respectful, and factual writing.
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
              <input
                type="checkbox"
                checked={consentOptIn}
                onChange={(e) => setConsentOptIn(e.target.checked)}
              />
              Proof of consent (opt-in) collected.
            </label>
            <textarea
              value={consentProof}
              onChange={(e) => setConsentProof(e.target.value)}
              placeholder="Proof of consent (required): URL, form/version id, or internal audit reference"
              style={{ minHeight: "70px", padding: "0.45rem", border: "1px solid #bbb" }}
            />
          </div>
        </section>
        ) : null}

        {message ? (
          <p style={{ marginTop: "0.9rem", fontSize: "0.85rem", color: "#7b2d00" }}>{message}</p>
        ) : null}

        {isPhoneVerified ? (
          <div style={{ marginTop: "1rem" }}>
            <button
              type="button"
              onClick={saveOnboarding}
              disabled={!canSubmit || saving}
              style={{
                padding: "0.55rem 0.8rem",
                border: "1px solid #1a472a",
                background: "#fff",
                cursor: saving || !canSubmit ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "Finish onboarding"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
