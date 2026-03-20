"use client";

export default function LoadingSection() {
  return (
    <div
      style={{
        padding: "3rem",
        textAlign: "center",
        borderTop: "1px solid #d4cfc4",
        background: "#faf8f3",
      }}
    >
      <div
        className="animate-spin-slow"
        style={{
          display: "inline-block",
          width: "38px",
          height: "38px",
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
        Gathering stories for your stream&hellip;
      </p>
    </div>
  );
}
