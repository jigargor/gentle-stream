"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  fallbackHref?: string;
}

export function BackButton({ fallbackHref = "/" }: BackButtonProps) {
  const router = useRouter();

  function handleBack() {
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Back to Feed"
      title="Back to Feed"
      style={{
        border: "1px solid #1a1a1a",
        background: "color-mix(in srgb, #faf8f3 78%, transparent)",
        color: "#1a1a1a",
        width: "2rem",
        height: "2rem",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "999px",
        boxShadow: "0 6px 16px rgba(0, 0, 0, 0.1)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        cursor: "pointer",
        transition: "transform 140ms ease, box-shadow 140ms ease, background 140ms ease",
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        <path
          d="M15 5L8 12L15 19"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
