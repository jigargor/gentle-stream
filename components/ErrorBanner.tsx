"use client";

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      style={{
        padding: "2.5rem",
        textAlign: "center",
        background: "#fff8f0",
        borderTop: "1px solid #f0d0a0",
      }}
    >
      <p
        style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#8b4513",
          marginBottom: "1.2rem",
          fontSize: "0.95rem",
        }}
      >
        {message}
      </p>
      <button
        onClick={onRetry}
        style={{
          background: "#1a1a1a",
          color: "#faf8f3",
          border: "none",
          padding: "0.55rem 1.8rem",
          fontFamily: "'Playfair Display', Georgia, serif",
          cursor: "pointer",
          fontSize: "0.82rem",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          transition: "background 0.2s ease",
        }}
        onMouseEnter={(e) =>
          ((e.target as HTMLButtonElement).style.background = "#c8a84b")
        }
        onMouseLeave={(e) =>
          ((e.target as HTMLButtonElement).style.background = "#1a1a1a")
        }
      >
        Try Again
      </button>
    </div>
  );
}
