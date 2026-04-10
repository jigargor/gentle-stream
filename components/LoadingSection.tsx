"use client";

export default function LoadingSection() {
  return (
    <div
      style={{
        minHeight: "7.5rem",
        padding: "2rem 1rem 1.75rem",
        textAlign: "center",
        borderTop: "1px solid var(--gs-border)",
        background: "var(--gs-surface)",
      }}
    >
      <div
        className="animate-spin-slow"
        style={{
          display: "inline-block",
          width: "34px",
          height: "34px",
          border: "3px solid #d4cfc4",
          borderTop: "3px solid #1a1a1a",
          borderRadius: "50%",
          marginBottom: "1rem",
        }}
      />
      <p
        style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#888",
          fontSize: "0.9rem",
        }}
      >
        Loading more stories&hellip;
      </p>
    </div>
  );
}
