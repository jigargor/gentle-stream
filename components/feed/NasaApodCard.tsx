"use client";

import type { NasaModuleData } from "@/lib/types";

interface NasaApodCardProps {
  data: NasaModuleData;
  reason?: "gap" | "interval" | "singleton";
}

export default function NasaApodCard({ data, reason = "singleton" }: NasaApodCardProps) {
  const reasonLabel =
    reason === "singleton"
      ? null
      : reason === "gap"
        ? "gap-fill"
        : "interval";

  return (
    <section
      className="gs-card-lift"
      style={{
        borderTop: "3px double var(--gs-ink-strong)",
        borderBottom: "2px solid var(--gs-ink-strong)",
        borderLeft: "1px solid var(--gs-border)",
        borderRight: "1px solid var(--gs-border)",
        borderRadius: "var(--gs-radius-sm)",
        background: "var(--gs-surface-soft)",
        padding: "0.95rem 1rem",
        boxShadow: "0 8px 20px rgba(20, 15, 10, 0.08)",
      }}
      aria-label="NASA Astronomy Picture of the Day"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid var(--gs-border)",
          paddingBottom: "0.4rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            letterSpacing: "0.01em",
            fontSize: "1.03rem",
            color: "#1f1f1f",
          }}
        >
          {data.title}
        </h3>
        {reasonLabel ? (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.67rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#746a55",
            }}
          >
            {reasonLabel}
          </span>
        ) : null}
      </header>

      {data.imageUrl ? (
        <div style={{ marginBottom: "0.65rem" }}>
          <img
            src={data.imageUrl}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              maxHeight: "min(52vh, 420px)",
              objectFit: "cover",
              border: "1px solid var(--gs-border)",
              borderRadius: "var(--gs-radius-sm)",
            }}
          />
        </div>
      ) : null}

      <p
        style={{
          margin: "0 0 0.65rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "0.92rem",
          lineHeight: 1.5,
          color: "#2a2a2a",
        }}
      >
        {data.subtitle}
      </p>

      {data.sourceUrl ? (
        <a
          href={data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "#1a472a",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
          }}
        >
          {data.mediaType === "video" ? "Open on NASA" : "View on NASA"}
        </a>
      ) : null}
    </section>
  );
}
