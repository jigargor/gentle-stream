export interface CreatorAccessSectionProps {
  isCreatorLogin: boolean;
  loginTextMuted: string;
  onOpenNotice: () => void;
}

export function CreatorAccessSection({
  isCreatorLogin,
  loginTextMuted,
  onOpenNotice,
}: CreatorAccessSectionProps) {
  if (isCreatorLogin) return null;

  return (
    <div
      style={{
        margin: "1.35rem 0 0",
        paddingTop: "1.1rem",
        borderTop: "1px solid #e0dcd4",
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: "0 0 0.45rem",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.68rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: loginTextMuted,
        }}
      >
        Creators
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "0.82rem",
          color: "#555",
          lineHeight: 1.55,
        }}
      >
        <button
          type="button"
          onClick={onOpenNotice}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            color: "#1a472a",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          Creator access (work in progress)
        </button>
        <span style={{ color: loginTextMuted, margin: "0 0.35rem" }} aria-hidden>
          |
        </span>
        <a
          href={`/creator/login?next=${encodeURIComponent("/creator")}`}
          style={{
            color: "#1a472a",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
          }}
        >
          Creator studio
        </a>
      </p>
      <p
        style={{
          margin: "0.4rem 0 0",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "0.72rem",
          color: loginTextMuted,
          lineHeight: 1.45,
        }}
      >
        This sets where you go after sign-in (Google, Facebook, or email/password). Stay on this
        page and complete sign-in above.
      </p>
    </div>
  );
}
