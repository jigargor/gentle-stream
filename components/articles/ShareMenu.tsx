"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

interface ShareMenuProps {
  articleId: string;
  headline: string;
  byline: string;
  body: string;
}

function ShareIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        d="M18 8a3 3 0 1 0-2.83-4h-.34A3 3 0 0 0 12 6a3 3 0 0 0 .17.99L8.91 8.62A3 3 0 1 0 9 15c.42 0 .83-.09 1.2-.25l3.1 1.8A3 3 0 1 0 16 15a3 3 0 0 0-.2-1.07l3.26-1.63A3 3 0 1 0 18 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.35}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function stripForExcerpt(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function copyTextFallback(value: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fallback below
  }
  return copyTextFallback(value);
}

export function ShareMenu({ articleId, headline, byline, body }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number } | null>(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "");
  const articleUrl = `${origin}/article/${articleId}`;
  const excerpt = useMemo(() => stripForExcerpt(body).slice(0, 240), [body]);

  const payloadText = useMemo(() => {
    const safeByline = byline?.trim() ? byline.trim() : "Gentle Stream";
    const safeExcerpt = excerpt ? `${excerpt}${excerpt.length >= 240 ? "..." : ""}` : "";
    return [headline, safeByline, "", safeExcerpt, "", articleUrl].filter(Boolean).join("\n");
  }, [articleUrl, byline, excerpt, headline]);

  const iframeEmbed = useMemo(() => {
    return `<iframe src="${origin}/embed/article/${articleId}" width="100%" height="520" style="border:0;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  }, [articleId, origin]);

  const scriptEmbed = useMemo(() => {
    return `<blockquote class="gentle-stream-embed" data-article-id="${articleId}"><a href="${articleUrl}">${headline}</a></blockquote>\n<script async src="${origin}/embed/script" charset="utf-8"></script>`;
  }, [articleId, articleUrl, headline, origin]);

  const recomputeMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuWidth = menuRef.current?.offsetWidth ?? 220;
    const menuHeight = menuRef.current?.offsetHeight ?? 180;
    const viewportPad = 10;

    let left = rect.right - menuWidth;
    if (left < viewportPad) left = viewportPad;
    if (left + menuWidth > viewportWidth - viewportPad) {
      left = Math.max(viewportPad, viewportWidth - viewportPad - menuWidth);
    }

    let top = rect.bottom + 6;
    const overflowsBottom = top + menuHeight > viewportHeight - viewportPad;
    if (overflowsBottom) {
      const above = rect.top - menuHeight - 6;
      top = above >= viewportPad ? above : Math.max(viewportPad, viewportHeight - viewportPad - menuHeight);
    }

    setMenuStyle({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    recomputeMenuPosition();
    const onDocClick = (evt: MouseEvent) => {
      const target = evt.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") setOpen(false);
    };
    const onWindowChange = () => recomputeMenuPosition();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onWindowChange, true);
    window.addEventListener("resize", onWindowChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onWindowChange, true);
      window.removeEventListener("resize", onWindowChange);
    };
  }, [open, recomputeMenuPosition]);

  async function runCopy(value: string, successMessage: string) {
    const ok = await copyText(value);
    setStatus(ok ? successMessage : "Copy failed");
    if (ok) {
      setOpen(false);
    }
    window.setTimeout(() => setStatus(null), 2200);
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share article"
        title="Share"
        style={{
          width: "2.15rem",
          height: "2.15rem",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          borderRadius: "6px",
          background: "transparent",
          color: "#1a1a1a",
          cursor: "pointer",
          transition: "all 140ms ease",
        }}
      >
        <ShareIcon />
      </button>
      {status ? (
        <span
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.68rem",
            color: status.includes("failed") ? "#8b4513" : "#1a472a",
          }}
        >
          {status}
        </span>
      ) : null}
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: menuStyle?.top ?? 12,
                left: menuStyle?.left ?? 12,
                zIndex: 1300,
                minWidth: "220px",
                background: "#fff",
                border: "1px solid #d8d2c7",
                borderRadius: "6px",
                boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
                padding: "0.35rem",
                display: "grid",
                gap: "0.2rem",
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => void runCopy(payloadText, "Text copied")}
                style={menuButtonStyle}
              >
                Copy text
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void runCopy(articleUrl, "Link copied")}
                style={menuButtonStyle}
              >
                Copy link
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void runCopy(iframeEmbed, "Iframe embed copied")}
                style={menuButtonStyle}
              >
                Create embed (iframe)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void runCopy(scriptEmbed, "Script embed copied")}
                style={menuButtonStyle}
              >
                Create embed (script)
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

const menuButtonStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  border: "1px solid #ece7df",
  background: "#fff",
  padding: "0.42rem 0.54rem",
  cursor: "pointer",
  fontFamily: "'IM Fell English', Georgia, serif",
  fontSize: "0.84rem",
  color: "#222",
};

