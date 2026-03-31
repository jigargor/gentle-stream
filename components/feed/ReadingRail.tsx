"use client";

import Link from "next/link";
import type { ReadingRailConfig, ReadingRailModule } from "@/lib/types";
import WeatherFillerCard from "./WeatherFillerCard";
import SpotifyMoodTile from "./SpotifyMoodTile";
import NasaApodCard from "./NasaApodCard";
import GeneratedArtModuleCard from "./GeneratedArtModuleCard";
import TodoFillerCard from "./TodoFillerCard";

function renderModule(mod: ReadingRailModule, key: string) {
  const reason = "singleton" as const;
  switch (mod.kind) {
    case "weather":
      return <WeatherFillerCard key={key} data={mod.data} reason={reason} />;
    case "spotify":
      return <SpotifyMoodTile key={key} data={mod.data} reason={reason} />;
    case "nasa":
      return <NasaApodCard key={key} data={mod.data} reason={reason} />;
    case "generated_art":
      return <GeneratedArtModuleCard key={key} data={mod.data} reason={reason} />;
    case "todo":
      return <TodoFillerCard key={key} data={mod.data} reason={reason} />;
    default:
      return null;
  }
}

interface ReadingRailProps {
  rail: ReadingRailConfig;
}

export default function ReadingRail({ rail }: ReadingRailProps) {
  if (!rail.enabled) return null;
  const hasModules = Boolean(rail.primary || rail.secondary);
  const hasRelated = (rail.relatedHeadlines?.length ?? 0) > 0;
  if (!hasModules && !hasRelated) return null;

  return (
    <aside
      aria-label="Alongside this story"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.65rem",
        minWidth: 0,
      }}
    >
      {rail.primary ? renderModule(rail.primary, "rail-primary") : null}
      {rail.secondary ? renderModule(rail.secondary, "rail-secondary") : null}
      {hasRelated ? (
        <section
          style={{
            borderTop: "3px double #1a1a1a",
            borderBottom: "2px solid #1a1a1a",
            background: "#f7f3ea",
            padding: "0.65rem 0.75rem",
          }}
        >
          <h3
            style={{
              margin: "0 0 0.4rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "#1f1f1f",
            }}
          >
            More in this topic
          </h3>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1rem",
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.68rem",
              lineHeight: 1.45,
              color: "#3a3428",
            }}
          >
            {(rail.relatedHeadlines ?? []).map((item) => (
              <li key={item.id} style={{ marginBottom: "0.28rem" }}>
                <Link
                  href={`/article/${item.id}`}
                  style={{ color: "#1a472a", textDecoration: "underline" }}
                >
                  {item.headline}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
