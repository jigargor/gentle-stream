import Link from "next/link";
import type { CSSProperties } from "react";

interface CreatorBylineLinkProps {
  byline: string;
  authorUserId?: string | null;
  /** When false, render plain text (ingest / legacy). */
  linkToProfile?: boolean;
  accentColor?: string;
  authorPenName?: string | null;
  authorAvatarUrl?: string | null;
  authorUsername?: string | null;
  variant?: "feed" | "reader";
}

function penNameFromByline(byline: string): string {
  const t = byline.trim();
  const m = /^by\s+(.+)$/i.exec(t);
  return (m ? m[1] : t).trim();
}

export function CreatorBylineLink({
  byline,
  authorUserId,
  linkToProfile = false,
  accentColor = "#1a472a",
  authorPenName,
  authorAvatarUrl,
  authorUsername,
  variant = "feed",
}: CreatorBylineLinkProps) {
  const pen =
    (authorPenName?.trim() || penNameFromByline(byline)).trim() || "Author";

  const avatarPx = variant === "reader" ? 28 : 22;
  const nameSize = variant === "reader" ? "0.82rem" : "0.72rem";
  const handleSize = variant === "reader" ? "0.65rem" : "0.6rem";

  const plain: CSSProperties = {
    fontWeight: 600,
    color: "#555",
  };

  if (!linkToProfile || !authorUserId) {
    return <span style={plain}>{byline.trim() || pen}</span>;
  }

  const nameColor = accentColor;

  return (
    <Link
      href={`/creator/${authorUserId}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        textDecoration: "none",
        color: "inherit",
        maxWidth: "100%",
      }}
    >
      {authorAvatarUrl ? (
        <img
          src={authorAvatarUrl}
          alt=""
          width={avatarPx}
          height={avatarPx}
          style={{
            borderRadius: "50%",
            objectFit: "cover",
            border: "1px solid #d4cfc4",
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: avatarPx,
            height: avatarPx,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4a6741, #2c3d28)",
            color: "#faf8f3",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: variant === "reader" ? "0.62rem" : "0.55rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          {pen.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0.04rem",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            fontSize: nameSize,
            color: nameColor,
            lineHeight: 1.2,
          }}
        >
          {pen}
        </span>
        {authorUsername ? (
          <span
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: handleSize,
              color: "#888",
              lineHeight: 1.2,
            }}
          >
            @{authorUsername}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
