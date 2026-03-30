"use client";

import type {
  FeedModuleData,
  GeneratedImageModuleData,
  TodoModuleData,
} from "@/lib/types";

interface InlineModuleCardProps {
  moduleType: "generated_art" | "todo";
  data: FeedModuleData;
}

export default function InlineModuleCard({
  moduleType,
  data,
}: InlineModuleCardProps) {
  if (moduleType === "todo" && data.mode === "todo") {
    const td = data as TodoModuleData;
    return (
      <aside
        style={{
          borderTop: "1px solid #d4cfc4",
          padding: "0.45rem 0.55rem",
          background: "rgba(250,248,243,0.9)",
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.78rem",
            fontWeight: 700,
            marginBottom: "0.28rem",
          }}
        >
          {td.title}
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1rem",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.7rem",
            color: "#4c463d",
            lineHeight: 1.45,
          }}
        >
          {td.items.slice(0, 3).map((item) => (
            <li
              key={item.id}
              style={{
                textDecoration: item.done ? "line-through" : undefined,
                opacity: item.done ? 0.65 : 1,
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      </aside>
    );
  }

  if (moduleType === "generated_art" && data.mode === "generated_art") {
    const art = data as GeneratedImageModuleData;
    return (
      <aside
        style={{
          borderTop: "1px solid #d4cfc4",
          padding: "0.45rem 0.55rem",
          background: "rgba(250,248,243,0.9)",
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.78rem",
            fontWeight: 700,
            marginBottom: "0.28rem",
          }}
        >
          {art.title}
        </div>
        <img
          src={art.imageUrl}
          alt=""
          loading="lazy"
          style={{
            width: "100%",
            maxHeight: 130,
            objectFit: "cover",
            border: "1px solid #d7d0c1",
          }}
        />
      </aside>
    );
  }

  return null;
}
