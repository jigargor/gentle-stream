"use client";

import { useCallback, useState } from "react";

function filenameForBlob(blob: Blob, stamp: number): string {
  const t = blob.type.toLowerCase();
  if (t.includes("png")) return `daily-curio-${stamp}.png`;
  if (t.includes("webp")) return `daily-curio-${stamp}.webp`;
  if (t.includes("jpeg") || t.includes("jpg")) return `daily-curio-${stamp}.jpg`;
  if (t.includes("gif")) return `daily-curio-${stamp}.gif`;
  return `daily-curio-${stamp}.jpg`;
}

async function tryDownloadUrl(url: string, stamp: number): Promise<boolean> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) return false;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filenameForBlob(blob, stamp);
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  return true;
}

interface CurioDownloadButtonProps {
  sourceUrl: string | null;
  /** Try these if direct fetch of sourceUrl fails (e.g. CORS). */
  fallbackUrls?: string[];
  variant?: "default" | "compact";
}

export default function CurioDownloadButton({
  sourceUrl,
  fallbackUrls = [],
  variant = "default",
}: CurioDownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (!sourceUrl || busy) return;
    setBusy(true);
    const stamp = Date.now();
    const ordered = [sourceUrl, ...fallbackUrls.filter((u) => u && u !== sourceUrl)];
    try {
      for (const url of ordered) {
        try {
          const ok = await tryDownloadUrl(url, stamp);
          if (ok) return;
        } catch {
          /* try next */
        }
      }
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }, [busy, fallbackUrls, sourceUrl]);

  const isCompact = variant === "compact";
  const disabled = !sourceUrl || busy;

  return (
    <button
      type="button"
      disabled={disabled}
      title={sourceUrl ? "Download this image" : "No image to download"}
      aria-label="Download Daily Curio image"
      onClick={() => void handleClick()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.28rem",
        padding: isCompact ? "0.18rem 0.38rem" : "0.32rem 0.55rem",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        fontSize: isCompact ? "0.62rem" : "0.68rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: disabled ? "#a39a8a" : "#4c463d",
        background: "color-mix(in srgb, var(--gs-surface) 92%, #f0ebe0)",
        border: "1px solid var(--gs-border)",
        borderRadius: "var(--gs-radius-xs)",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 1px 2px rgba(20, 15, 10, 0.06)",
      }}
    >
      <svg
        width={isCompact ? 11 : 12}
        height={isCompact ? 11 : 12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {busy ? "…" : "Save"}
    </button>
  );
}
