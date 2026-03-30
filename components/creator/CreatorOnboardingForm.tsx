"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES } from "@/lib/constants";

interface CreatorOnboardingFormProps {
  initialPhone: string;
}

function parseCommaTags(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function CreatorOnboardingForm({ initialPhone }: CreatorOnboardingFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [otpToken, setOtpToken] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [penName, setPenName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [locale, setLocale] = useState("global");
  const [timezone, setTimezone] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    return isPhoneVerified && penName.trim().length > 0 && guidelinesAccepted;
  }, [guidelinesAccepted, isPhoneVerified, penName]);

  async function sendPhoneOtp() {
    setMessage(null);
    setPhoneBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ phone: phone.trim() });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage("OTP sent to your phone. Enter it below to verify.");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyPhoneOtp() {
    setMessage(null);
    setPhoneBusy(true);
    try {
      const supabase = createClient();
      const token = otpToken.trim();
      const phoneValue = phone.trim();
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
      setMessage("Phone number verified.");
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
          Verify phone, set your creator profile, then start submitting stories for review.
        </p>

        <section style={{ borderTop: "1px solid #ddd", paddingTop: "0.9rem" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>1) Verify phone number</h2>
          <div style={{ display: "grid", gap: "0.5rem", maxWidth: "420px" }}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              style={{ padding: "0.45rem", border: "1px solid #bbb" }}
            />
            <button
              onClick={sendPhoneOtp}
              disabled={phoneBusy || isPhoneVerified}
              style={{ padding: "0.45rem", border: "1px solid #777", background: "#fff", cursor: "pointer" }}
            >
              {isPhoneVerified ? "Phone verified" : "Send OTP"}
            </button>
            <input
              value={otpToken}
              onChange={(e) => setOtpToken(e.target.value)}
              placeholder="6-digit OTP"
              style={{ padding: "0.45rem", border: "1px solid #bbb" }}
            />
            <button
              onClick={verifyPhoneOtp}
              disabled={phoneBusy || isPhoneVerified || otpToken.trim().length < 4}
              style={{ padding: "0.45rem", border: "1px solid #777", background: "#fff", cursor: "pointer" }}
            >
              Confirm OTP
            </button>
          </div>
        </section>

        <section style={{ borderTop: "1px solid #ddd", marginTop: "0.9rem", paddingTop: "0.9rem" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>2) Creator profile</h2>
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
          </div>
        </section>

        {message ? (
          <p style={{ marginTop: "0.9rem", fontSize: "0.85rem", color: "#7b2d00" }}>{message}</p>
        ) : null}

        <div style={{ marginTop: "1rem" }}>
          <button
            onClick={saveOnboarding}
            disabled={!canSubmit || saving}
            style={{ padding: "0.55rem 0.8rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer" }}
          >
            {saving ? "Saving..." : "Finish onboarding"}
          </button>
        </div>
      </div>
    </div>
  );
}
