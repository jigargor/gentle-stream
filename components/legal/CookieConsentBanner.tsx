"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const COOKIE_CONSENT_STORAGE_KEY = "gs_cookie_consent_v1";
const COOKIE_CONSENT_VERSION = 1;

interface CookieConsentPreference {
  version: number;
  essential: true;
  analytics: boolean;
  mode: "accept_all" | "reject_all" | "custom";
  updatedAt: string;
}

function readStoredConsent(): CookieConsentPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsentPreference>;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    if (typeof parsed.analytics !== "boolean") return null;
    if (
      parsed.mode !== "accept_all" &&
      parsed.mode !== "reject_all" &&
      parsed.mode !== "custom"
    ) {
      return null;
    }
    if (typeof parsed.updatedAt !== "string" || parsed.updatedAt.length === 0)
      return null;
    return {
      version: COOKIE_CONSENT_VERSION,
      essential: true,
      analytics: parsed.analytics,
      mode: parsed.mode,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function persistConsent(preference: CookieConsentPreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify(preference)
  );
}

export function CookieConsentBanner() {
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = readStoredConsent();
    if (stored) {
      setAnalyticsEnabled(stored.analytics);
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (isOpen) primaryActionRef.current?.focus();
  }, [isOpen]);

  function saveConsent(mode: CookieConsentPreference["mode"], analytics: boolean) {
    persistConsent({
      version: COOKIE_CONSENT_VERSION,
      essential: true,
      analytics,
      mode,
      updatedAt: new Date().toISOString(),
    });
    setIsOpen(false);
    setShowCustomize(false);
  }

  if (!isMounted || !isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        background: "var(--gs-backdrop-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <section
        style={{
          width: "min(30rem, 94vw)",
          borderRadius: "var(--gs-radius-lg)",
          border: "1px solid var(--gs-border-strong)",
          background: "var(--gs-surface-elevated)",
          boxShadow: "var(--gs-shadow-overlay)",
          padding: "1.15rem 1.2rem 1rem",
        }}
      >
        <h2
          id="cookie-consent-title"
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.15rem",
            color: "var(--gs-ink-strong)",
          }}
        >
          Cookie notice
        </h2>
        <p
          style={{
            margin: "0.5rem 0 0",
            fontFamily: "Georgia, serif",
            fontSize: "0.87rem",
            lineHeight: 1.45,
            color: "var(--gs-muted)",
          }}
        >
          We use essential cookies to keep your account signed in and protect your
          session. You can choose whether optional analytics cookies are enabled.
          Learn more in our{" "}
          <Link
            href="/privacy"
            className="gs-focus-ring"
            style={{ color: "var(--gs-accent-foreground)" }}
          >
            privacy policy
          </Link>
          .
        </p>

        {showCustomize ? (
          <div
            style={{
              marginTop: "0.85rem",
              border: "1px solid var(--gs-border)",
              borderRadius: "var(--gs-radius-md)",
              background:
                "color-mix(in srgb, var(--gs-surface-soft) 88%, transparent)",
              padding: "0.75rem 0.8rem",
              display: "grid",
              gap: "0.65rem",
            }}
          >
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.85rem",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.82rem",
                  color: "var(--gs-ink-strong)",
                  letterSpacing: "0.03em",
                }}
              >
                Essential cookies
              </span>
              <span
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "0.75rem",
                  color: "var(--gs-muted)",
                  opacity: 0.9,
                }}
              >
                Always on
              </span>
            </label>
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.85rem",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.82rem",
                  color: "var(--gs-ink-strong)",
                  letterSpacing: "0.03em",
                }}
              >
                Analytics cookies
              </span>
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(event) => setAnalyticsEnabled(event.target.checked)}
              />
            </label>
            <button
              type="button"
              className="gs-focus-ring"
              onClick={() => saveConsent("custom", analyticsEnabled)}
              style={{
                justifySelf: "end",
                border: "1px solid var(--gs-border-strong)",
                borderRadius: "var(--gs-radius-pill)",
                background: "var(--gs-surface-elevated)",
                color: "var(--gs-ink-strong)",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.74rem",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "0.42rem 0.72rem",
                cursor: "pointer",
              }}
            >
              Save preferences
            </button>
          </div>
        ) : null}

        <div
          style={{
            marginTop: "0.95rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.55rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="gs-focus-ring"
            onClick={() => setShowCustomize((current) => !current)}
            style={{
              border: "1px solid var(--gs-border-strong)",
              borderRadius: "var(--gs-radius-pill)",
              background:
                "color-mix(in srgb, var(--gs-surface-elevated) 68%, transparent)",
              color: "var(--gs-ink-strong)",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.74rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "0.42rem 0.72rem",
              cursor: "pointer",
            }}
          >
            Customize
          </button>
          <button
            type="button"
            className="gs-focus-ring"
            onClick={() => saveConsent("reject_all", false)}
            style={{
              border: "1px solid var(--gs-border-strong)",
              borderRadius: "var(--gs-radius-pill)",
              background:
                "color-mix(in srgb, var(--gs-surface-elevated) 70%, transparent)",
              color: "var(--gs-muted)",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.74rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "0.42rem 0.72rem",
              cursor: "pointer",
            }}
          >
            Reject all
          </button>
          <button
            ref={primaryActionRef}
            type="button"
            className="gs-focus-ring gs-interactive"
            onClick={() => saveConsent("accept_all", true)}
            style={{
              border: "1px solid color-mix(in srgb, var(--gs-accent) 52%, var(--gs-border))",
              borderRadius: "var(--gs-radius-pill)",
              background: "var(--gs-accent)",
              color: "var(--gs-bg)",
              boxShadow: "var(--gs-shadow-control)",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.74rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "0.42rem 0.72rem",
              cursor: "pointer",
            }}
          >
            Accept all
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
