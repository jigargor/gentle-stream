"use client";

import type { EditorialBreatherModuleData } from "@/lib/types";

interface EditorialBreatherCardProps {
  data: EditorialBreatherModuleData;
}

function motifNode(motif: EditorialBreatherModuleData["motif"]) {
  if (motif === "stamp") {
    return (
      <div
        aria-hidden
        style={{
          width: "2.1rem",
          height: "2.1rem",
          borderRadius: "50%",
          border: "1px dashed rgba(87, 72, 49, 0.45)",
          display: "grid",
          placeItems: "center",
          color: "#5b4a32",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.64rem",
          letterSpacing: "0.09em",
          textTransform: "uppercase",
        }}
      >
        Note
      </div>
    );
  }
  if (motif === "divider") {
    return (
      <div
        aria-hidden
        style={{
          width: "100%",
          height: "0.32rem",
          borderTop: "1px solid rgba(85, 70, 48, 0.5)",
          borderBottom: "1px solid rgba(85, 70, 48, 0.22)",
          opacity: 0.75,
        }}
      />
    );
  }
  return (
    <svg
      aria-hidden
      width="56"
      height="18"
      viewBox="0 0 56 18"
      style={{ display: "block", opacity: 0.75 }}
    >
      <path d="M1 9h54" stroke="rgba(85, 70, 48, 0.52)" strokeWidth="1.2" />
      <path d="M8 4.5h40" stroke="rgba(85, 70, 48, 0.25)" strokeWidth="0.9" />
      <path d="M12 13.5h32" stroke="rgba(85, 70, 48, 0.2)" strokeWidth="0.9" />
    </svg>
  );
}

export default function EditorialBreatherCard({ data }: EditorialBreatherCardProps) {
  return (
    <aside
      className="gs-card-lift"
      aria-label="Editorial breather"
      style={{
        borderTop: "1px solid var(--gs-border)",
        padding: "0.58rem 0.64rem",
        background:
          "linear-gradient(180deg, rgba(251,248,240,0.9) 0%, rgba(246,240,228,0.78) 100%)",
        borderRadius: "0 0 var(--gs-radius-sm) var(--gs-radius-sm)",
      }}
    >
      <div style={{ display: "grid", gap: "0.35rem" }}>
        {data.kicker ? (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.61rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6a5c47",
            }}
          >
            {data.kicker}
          </span>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          {motifNode(data.motif)}
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.82rem",
                color: "#2f281f",
                lineHeight: 1.3,
              }}
            >
              {data.title}
            </p>
            <p
              style={{
                margin: "0.2rem 0 0",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.74rem",
                color: "#5a5042",
                lineHeight: 1.35,
              }}
            >
              {data.line}
            </p>
          </div>
        </div>

        {data.href && data.hrefLabel ? (
          <a
            href={data.href}
            style={{
              alignSelf: "flex-start",
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.67rem",
              color: "var(--gs-accent)",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            {data.hrefLabel}
          </a>
        ) : null}
      </div>
    </aside>
  );
}
