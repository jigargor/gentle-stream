"use client";

import { CATEGORIES, type Category } from "@/lib/constants";

interface CategoryBarProps {
  selected: Category | null;
  onSelect: (cat: Category) => void;
}

export default function CategoryBar({ selected, onSelect }: CategoryBarProps) {
  return (
    <nav
      className="hide-scrollbar"
      style={{
        background: "#1a1a1a",
        overflowX: "auto",
        display: "flex",
        padding: 0,
      }}
    >
      {CATEGORIES.map((cat) => {
        const isActive = selected === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            style={{
              background: isActive ? "#c8a84b" : "transparent",
              color: isActive ? "#1a1a1a" : "#d4cfc4",
              border: "none",
              padding: "0.55rem 1.1rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.72rem",
              fontWeight: isActive ? 700 : 400,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "background 0.2s ease, color 0.2s ease",
              borderRight: "1px solid #333",
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
