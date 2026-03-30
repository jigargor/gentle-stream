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
      style={{
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#f7f3ea",
        padding: "0.95rem 1rem",
      }}
      aria-label="NASA Astronomy Picture of the Day"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid #d7d0c1",
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
              border: "1px solid #d7d0c1",
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
