"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TermsOfServiceContent } from "./TermsOfServiceContent";

function safeNextPath(raw: string | null | undefined) {
  if (!raw || typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return "/";
  return raw;
}

export function TermsAcceptGate({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sanitizedNextPath = useMemo(() => safeNextPath(nextPath), [nextPath]);

  const [canAgree, setCanAgree] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/user/preferences", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { termsAcceptedAt?: string | null };
        if (body.termsAcceptedAt) {
          router.replace(sanitizedNextPath);
        }
      } catch {
        // no-op: user can still accept below
      }
    })();
  }, [router, sanitizedNextPath]);

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

  async function submitAcceptance() {
    if (!canAgree || !checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/legal/terms-accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setError(body.message ?? body.error ?? "Could not save acceptance. Please try again.");
        return;
      }
      router.replace(sanitizedNextPath === "/terms/accept" ? "/" : sanitizedNextPath);
    } catch {
      setError("Could not save acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
            disabled={!canAgree || !checked || submitting}
            onClick={() => void submitAcceptance()}
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
              cursor: !canAgree || !checked || submitting ? "not-allowed" : "pointer",
              opacity: !canAgree || !checked || submitting ? 0.65 : 1,
            }}
          >
            {submitting ? "Saving..." : "Agree and continue"}
          </button>
          {error ? (
            <p
              style={{
                margin: "0.5rem 0 0",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.78rem",
                color: "#8b4513",
              }}
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

