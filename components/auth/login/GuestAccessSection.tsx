export interface GuestAccessSectionProps {
  isCreatorLogin: boolean;
  needsTurnstileChallenge: boolean;
  turnstileToken: string | null;
  guestBusy: boolean;
  onContinueAsGuest: () => void;
  loginTextMuted: string;
}

export function GuestAccessSection({
  isCreatorLogin,
  needsTurnstileChallenge,
  turnstileToken,
  guestBusy,
  onContinueAsGuest,
  loginTextMuted,
}: GuestAccessSectionProps) {
  if (isCreatorLogin) return null;

  const requiresChallenge = needsTurnstileChallenge && !turnstileToken;

  return (
    <div style={{ margin: "1rem 0 0", textAlign: "center" }}>
      {requiresChallenge ? (
        <p
          style={{
            margin: "0 0 0.45rem",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.72rem",
            color: loginTextMuted,
          }}
        >
          Complete the security check above to unlock guest browsing.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onContinueAsGuest}
        disabled={guestBusy || requiresChallenge}
        title={requiresChallenge ? "Complete the security check above first." : "Continue as guest"}
        aria-label={
          requiresChallenge
            ? "Continue as guest is disabled until security check is complete"
            : "Continue as guest"
        }
        style={{
          width: "100%",
          boxSizing: "border-box",
          textAlign: "center",
          padding: "0.58rem 1rem",
          border: "1px solid #b7b2a8",
          background: "#f5f1e8",
          color: "#3d3b35",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.78rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          cursor: guestBusy ? "wait" : requiresChallenge ? "not-allowed" : "pointer",
          opacity: requiresChallenge && !guestBusy ? 0.55 : 1,
        }}
      >
        {guestBusy ? "Verifying..." : "Continue as guest"}
      </button>
    </div>
  );
}
