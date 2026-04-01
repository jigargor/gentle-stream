"use client";

import { CATEGORIES, type Category } from "@/lib/constants";

interface CategoryBarProps {
  selected: Category | null;
  onSelect: (cat: Category) => void;
  /**
   * When provided (> 0), the category bar becomes sticky underneath the masthead.
   * When hidden, we translate it out of view and disable pointer events.
   */
  stickyTopPx?: number;
  visible?: boolean;
}

export default function CategoryBar({
  selected,
  onSelect,
  stickyTopPx,
  visible = true,
}: CategoryBarProps) {
  const shouldStick = typeof stickyTopPx === "number";
  return (
    <nav
      className="hide-scrollbar"
      style={{
        background: "var(--gs-ink-strong)",
        position: shouldStick ? "sticky" : "relative",
        top: shouldStick ? stickyTopPx : undefined,
        zIndex: 95,
        overflowX: "auto",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        flexWrap: "wrap",
        padding: 0,
        width: "100%",
        boxShadow: visible && shouldStick ? "var(--gs-shadow-popover)" : "none",
        transform: visible ? "translateY(0)" : "translateY(-220%)",
        opacity: visible ? 1 : 0,
        transition: visible
          ? "transform 0.12s ease, opacity 0.12s ease, box-shadow 0.12s ease"
          : "transform 0.05s linear, opacity 0.05s ease, box-shadow 0.05s ease",
        pointerEvents: visible ? "auto" : "none",
        willChange: "transform, opacity",
      }}
    >
      {CATEGORIES.map((cat, index) => {
        const isActive = selected === cat;
        const isLast = index === CATEGORIES.length - 1;
        return (
          <button
            className="gs-interactive gs-focus-ring"
            key={cat}
            onClick={() => onSelect(cat)}
            style={{
              background: isActive ? "#c8a84b" : "transparent",
              color: isActive ? "#1a1a1a" : "#efe9dd",
              border: "none",
              padding: "0.55rem 1.1rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.72rem",
              fontWeight: isActive ? 700 : 400,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition:
                "background var(--gs-motion-fast) var(--gs-ease-standard), color var(--gs-motion-fast) var(--gs-ease-standard)",
              borderRight: isLast ? "none" : "1px solid rgba(234, 227, 214, 0.16)",
              flexShrink: 0,
            }}
          >
            {cat}
          </button>
        );
      })}
    </nav>
  );
}
