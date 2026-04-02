"use client";

import type { ReactNode } from "react";
import { AppLogo } from "@/components/brand/AppLogo";

export const MASTHEAD_TOP_BAR_HEIGHT_PX = 42;

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
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 130,
          background: "var(--gs-surface-elevated)",
          borderBottom: "1px solid var(--gs-border-strong)",
          height: `${MASTHEAD_TOP_BAR_HEIGHT_PX}px`,
          padding: "0.3rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.68rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          color: "var(--gs-muted)",
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

      <header
        className="hide-scrollbar"
        style={{
          borderBottom: "3px double var(--gs-ink-strong)",
          paddingTop: `${MASTHEAD_TOP_BAR_HEIGHT_PX + 8}px`,
          paddingBottom: "0.5rem",
          textAlign: "center",
          background: "var(--gs-surface)",
          boxShadow: "var(--gs-shadow-page)",
        }}
      >
        <div
          style={{
            padding: "0.5rem 1rem 0.25rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          <AppLogo heightPx={56} priority />
          <h1
            style={{
              fontFamily:
                "'UnifrakturMaguntia', 'Old Standard TT', Georgia, serif",
              fontSize: "clamp(2.8rem, 6vw, 5rem)",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              color: "var(--gs-text)",
              margin: 0,
              lineHeight: 1,
              textShadow: "1px 1px 0 rgba(0,0,0,0.05)",
            }}
          >
            Gentle Stream
          </h1>
          <div
            style={{
              height: "2px",
              background: "var(--gs-ink-strong)",
              margin: "0.35rem auto 0",
              maxWidth: "620px",
            }}
          />
        </div>
      </header>
    </>
  );
}
