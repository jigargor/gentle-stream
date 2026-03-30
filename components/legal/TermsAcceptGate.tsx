"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TERMS_ACCEPTED_COOKIE, TERMS_ACCEPTED_COOKIE_MAX_AGE_SEC } from "@/lib/legal/terms-policy";
import { TermsOfServiceContent } from "./TermsOfServiceContent";

const cookieEscape = (value: string) => value.replace(/[%]/g, encodeURIComponent("%"));

function safeNextPath(raw: string | null | undefined) {
  if (!raw || typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return "/";
  return raw;
}

function getCookieValue(cookieName: string) {
  if (typeof document === "undefined") return null;
  const cookieStr = document.cookie ?? "";
  const parts = cookieStr.split(";").map((p) => p.trim());
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === cookieName) return v ?? "";
  }
  return null;
}

export function TermsAcceptGate({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sanitizedNextPath = useMemo(() => safeNextPath(nextPath), [nextPath]);

  const [canAgree, setCanAgree] = useState(false);
  const [checked, setChecked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // If they already accepted, skip the gate.
    const accepted = getCookieValue(TERMS_ACCEPTED_COOKIE) === "1";
    if (accepted) {
      router.replace(sanitizedNextPath);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      const remainingPx = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = remainingPx <= 2; // tolerance for fractional pixels
      setCanAgree(atBottom || el.scrollHeight <= el.clientHeight + 1);
      setIsChecking(false);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function setAcceptedCookieAndContinue() {
    const maxAge = TERMS_ACCEPTED_COOKIE_MAX_AGE_SEC;
    // Not HttpOnly: cookie is only used for client-side gating.
    document.cookie = `${cookieEscape(TERMS_ACCEPTED_COOKIE)}=1; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
    router.replace(sanitizedNextPath === "/terms/accept" ? "/" : sanitizedNextPath);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ede9e1",
        padding: "1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "860px",
          background: "#faf8f3",
          borderTop: "3px double #1a1a1a",
          borderBottom: "2px solid #1a1a1a",
          boxShadow: "0 0 40px rgba(0,0,0,0.08)",
          padding: "1.35rem 1.25rem 1.15rem",
        }}
      >
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.35rem",
            margin: "0 0 0.4rem",
            color: "#0d0d0d",
          }}
        >
          Terms of service
        </h1>
        <p
          style={{
            margin: "0 0 1rem",
            fontFamily: "'IM Fell English', Georgia, serif",
            color: "#555",
            fontSize: "0.9rem",
            lineHeight: 1.5,
          }}
        >
          Scroll through the entire Terms of service before you can agree.
        </p>

        <div
          ref={scrollRef}
          style={{
            maxHeight: "52vh",
            overflowY: "auto",
            background: "#fff",
            border: "1.5px solid #1a1a1a",
            padding: "1rem 1.05rem",
            boxShadow: "0 0 24px rgba(0,0,0,0.05)",
          }}
          aria-label="Terms of service text"
        >
          <TermsOfServiceContent />
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.55rem",
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.85rem",
              color: "#555",
              lineHeight: 1.5,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!canAgree}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: "0.2rem" }}
            />
            <span>
              I have read and agree to the Terms of service.
              {!canAgree ? (
                <span style={{ display: "block", marginTop: "0.35rem", color: "#777" }}>
                  {isChecking ? "Checking scroll position…" : "Scroll to the bottom to enable."}
                </span>
              ) : null}
            </span>
          </label>

          <button
            type="button"
            disabled={!canAgree || !checked}
            onClick={setAcceptedCookieAndContinue}
            style={{
              width: "100%",
              marginTop: "0.9rem",
              padding: "0.65rem 1rem",
              border: "none",
              background: "#1a1a1a",
              color: "#faf8f3",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.78rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: !canAgree || !checked ? "not-allowed" : "pointer",
              opacity: !canAgree || !checked ? 0.65 : 1,
            }}
          >
            Agree and continue
          </button>
        </div>
      </div>
    </div>
  );
}

