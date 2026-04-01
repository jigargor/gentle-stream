"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "@/lib/constants";

interface CategoryDrawerProps {
  selected: Category | null;
  onSelect: (cat: Category) => void;
  topOffsetPx?: number;
}

export default function CategoryDrawer({
  selected,
  onSelect,
  topOffsetPx = 0,
}: CategoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleSelect(cat: Category) {
    onSelect(cat);
    setOpen(false);
  }

  const topPx = Math.max(8, topOffsetPx + 10);

  return (
    <>
      <button
        className="gs-interactive gs-focus-ring"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="category-drawer"
        aria-label="Open categories"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: `${topPx}px`,
          right: "0.95rem",
          zIndex: 130,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "2.35rem",
          height: "2.35rem",
          padding: 0,
          border: "1px solid var(--gs-border)",
          background: "rgba(250, 248, 243, 0.64)",
          borderRadius: "var(--gs-radius-md)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          color: "#1a1a1a",
          cursor: "pointer",
          boxShadow: "var(--gs-shadow-popover)",
        }}
      >
        <svg
          width={20}
          height={14}
          viewBox="0 0 20 14"
          aria-hidden
          style={{ display: "block" }}
        >
          <rect x="0" y="0" width="20" height="2" rx="0.5" fill="currentColor" />
          <rect x="0" y="6" width="20" height="2" rx="0.5" fill="currentColor" />
          <rect x="0" y="12" width="20" height="2" rx="0.5" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 140,
          }}
        >
          <button
            type="button"
            aria-label="Close category drawer"
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              border: "none",
              background: "rgba(8, 7, 4, 0.28)",
              cursor: "pointer",
            }}
          />

          <aside
            id="category-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Choose category"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(360px, 90vw)",
              background: "rgba(250, 248, 243, 0.92)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              borderLeft: "1px solid var(--gs-border)",
              boxShadow: "var(--gs-shadow-overlay)",
              display: "flex",
              flexDirection: "column",
              transform: "translateX(0)",
              transition: "transform var(--gs-motion-normal) var(--gs-ease-standard)",
            }}
          >
            <div
              style={{
                padding: "0.95rem 1rem 0.7rem",
                borderBottom: "1px solid var(--gs-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "1rem",
                  color: "var(--gs-text)",
                }}
              >
                Categories
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid var(--gs-border-strong)",
                  background: "var(--gs-surface-elevated)",
                  color: "var(--gs-ink-strong)",
                  borderRadius: "var(--gs-radius-pill)",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "0.35rem 0.62rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                overflowY: "auto",
                padding: "0.55rem",
                display: "grid",
                gap: "0.3rem",
              }}
            >
              {CATEGORIES.map((cat) => {
                const isActive = selected === cat;
                return (
                  <button
                    className="gs-interactive gs-focus-ring"
                    key={cat}
                    type="button"
                    onClick={() => handleSelect(cat)}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      border: isActive
                        ? "1.5px solid var(--gs-ink-strong)"
                        : "1px solid var(--gs-border)",
                      background: isActive ? "#d7bb66" : "var(--gs-surface-elevated)",
                      color: "#1a1a1a",
                      borderRadius: "var(--gs-radius-sm)",
                      padding: "0.6rem 0.65rem",
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: "0.76rem",
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      transition:
                        "transform var(--gs-motion-fast) var(--gs-ease-standard), border-color var(--gs-motion-fast) var(--gs-ease-standard)",
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

