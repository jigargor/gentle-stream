"use client";

export type PanelSaveStatusState = "idle" | "saving" | "saved" | "error";

interface PanelSaveStatusProps {
  status: PanelSaveStatusState;
  errorText?: string | null;
}

export function PanelSaveStatus({ status, errorText }: PanelSaveStatusProps) {
  if (status === "idle") return null;
  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        fontSize: "0.78rem",
        color: status === "error" ? "var(--gs-warning)" : "var(--gs-muted)",
        fontWeight: 400,
      }}
    >
      {status === "saving" && (
        <>
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              border: "1.5px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <svg
            aria-hidden="true"
            width={12}
            height={12}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,6 5,9 10,3" />
          </svg>
          Saved
        </>
      )}
      {status === "error" && (
        <>
          <svg
            aria-hidden="true"
            width={12}
            height={12}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <line x1="6" y1="2" x2="6" y2="7" />
            <line x1="6" y1="9.5" x2="6" y2="10" />
          </svg>
          {errorText ?? "Save failed"}
        </>
      )}
    </span>
  );
}
