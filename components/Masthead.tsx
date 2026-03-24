"use client";

import type { ReactNode } from "react";

interface MastheadProps {
  /** Replaces the right meta line (volume / date line) when signed in. */
  accountSlot?: ReactNode;
}

function getTodayDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Masthead({ accountSlot }: MastheadProps) {
  return (
    <header
      className="hide-scrollbar"
      style={{
        borderBottom: "3px double #1a1a1a",
        paddingBottom: "0.5rem",
        textAlign: "center",
        background: "#faf8f3",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 12px rgba(0,0,0,0.10)",
      }}
    >
      {/* Top meta bar */}
      <div
        style={{
          borderBottom: "1px solid #1a1a1a",
          padding: "0.3rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.68rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          color: "#555",
          letterSpacing: "0.05em",
        }}
      >
        <span>{getTodayDate()}</span>
        <span style={{ fontStyle: "italic" }}>
          &ldquo;All the news that lifts the spirit&rdquo;
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.35rem",
            maxWidth: "min(72vw, 420px)",
          }}
        >
          {accountSlot ?? <>Vol. I &nbsp;&middot;&nbsp; Est. 2025</>}
        </span>
      </div>

      {/* Masthead title */}
      <div style={{ padding: "0.5rem 1rem 0.25rem" }}>
        <h1
          style={{
            fontFamily:
              "'UnifrakturMaguntia', 'Old Standard TT', Georgia, serif",
            fontSize: "clamp(2.8rem, 6vw, 5rem)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            color: "#0d0d0d",
            margin: 0,
            lineHeight: 1,
            textShadow: "1px 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          Gentle Stream
        </h1>
        <div
          style={{
            height: "2px",
            background: "#1a1a1a",
            margin: "0.35rem auto 0",
            maxWidth: "620px",
          }}
        />
      </div>
    </header>
  );
}
