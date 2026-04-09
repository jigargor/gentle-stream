"use client";

import { useState } from "react";
import type { SpotifyMoodTileData } from "@/lib/types";

interface SpotifyMoodTileProps {
  data: SpotifyMoodTileData;
  reason: "gap" | "interval" | "singleton";
}

export default function SpotifyMoodTile({ data, reason }: SpotifyMoodTileProps) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function sendVote(next: "up" | "down") {
    if (pending || vote) return;
    setPending(true);
    setHint(null);
    try {
      const res = await fetch("/api/user/spotify-mood-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: data.mood, vote: next }),
      });
      if (res.status === 401) {
        setHint("Sign in to save mood preferences.");
        return;
      }
      if (!res.ok) {
        setHint("Could not save. Try again later.");
        return;
      }
      setVote(next);
    } finally {
      setPending(false);
    }
  }
  const reasonLabel =
    reason === "singleton"
      ? null
      : reason === "gap"
        ? "gap-fill"
        : "interval";
  const hasBackgroundImage = Boolean(data.imageUrl);

  return (
    <section
      className="gs-card-lift"
      style={{
        borderTop: "3px double var(--gs-ink-strong)",
        borderBottom: "2px solid var(--gs-ink-strong)",
        borderLeft: "1px solid var(--gs-border)",
        borderRight: "1px solid var(--gs-border)",
        borderRadius: "var(--gs-radius-sm)",
        backgroundImage: hasBackgroundImage
          ? `linear-gradient(rgba(247,243,234,0.9), rgba(247,243,234,0.95)), url("${data.imageUrl}")`
          : undefined,
        backgroundSize: hasBackgroundImage ? "cover" : undefined,
        backgroundPosition: hasBackgroundImage ? "center" : undefined,
        backgroundColor: "var(--gs-surface-soft)",
        padding: "0.95rem 1rem",
        boxShadow: "0 8px 20px rgba(20, 15, 10, 0.08)",
      }}
      aria-label="Spotify mood module"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid var(--gs-border)",
          paddingBottom: "0.4rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            letterSpacing: "0.01em",
            fontSize: "1.03rem",
            color: "#1f1f1f",
          }}
        >
          {data.title}
        </h3>
        {reasonLabel ? (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.67rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#746a55",
            }}
          >
            {reasonLabel}
          </span>
        ) : null}
      </header>

      <p
        style={{
          margin: "0 0 0.55rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#4f463b",
          fontSize: "0.9rem",
        }}
      >
        {data.subtitle}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.7rem",
          marginBottom: "0.55rem",
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.72rem",
            color: "#665d4f",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Mood: {data.mood}
        </span>
        {data.playlistUrl ? (
          <a
            href={data.playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.72rem",
              color: "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            Open top track
          </a>
        ) : null}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.55rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.68rem",
            color: "#665d4f",
          }}
        >
          This mood:
        </span>
        <button
          type="button"
          disabled={pending || Boolean(vote)}
          onClick={() => void sendVote("up")}
          aria-label="More like this mood"
          aria-pressed={vote === "up"}
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.75rem",
            padding: "0.2rem 0.45rem",
            borderRadius: "4px",
            border: "1px solid var(--gs-border)",
            background:
              vote === "up" ? "rgba(26, 71, 42, 0.12)" : "var(--gs-surface-soft)",
            cursor: pending || vote ? "default" : "pointer",
            opacity: vote && vote !== "up" ? 0.45 : 1,
          }}
        >
          👍 More
        </button>
        <button
          type="button"
          disabled={pending || Boolean(vote)}
          onClick={() => void sendVote("down")}
          aria-label="Less of this mood"
          aria-pressed={vote === "down"}
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.75rem",
            padding: "0.2rem 0.45rem",
            borderRadius: "4px",
            border: "1px solid var(--gs-border)",
            background:
              vote === "down" ? "rgba(120, 60, 40, 0.1)" : "var(--gs-surface-soft)",
            cursor: pending || vote ? "default" : "pointer",
            opacity: vote && vote !== "down" ? 0.45 : 1,
          }}
        >
          👎 Less
        </button>
        {hint ? (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.68rem",
              color: "#8b5a2b",
            }}
          >
            {hint}
          </span>
        ) : null}
        {vote ? (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.68rem",
              color: "#4f6b4a",
            }}
          >
            Saved for your feed.
          </span>
        ) : null}
      </div>

      {data.tracks.length > 0 ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            margin: 0,
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.78rem",
            color: "#3f3a30",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid var(--gs-border)",
                  padding: "0.25rem 0.35rem",
                  fontWeight: 700,
                }}
              >
                Song
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid var(--gs-border)",
                  padding: "0.25rem 0.35rem",
                  fontWeight: 700,
                }}
              >
                Artist
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid var(--gs-border)",
                  padding: "0.25rem 0.35rem",
                  fontWeight: 700,
                }}
              >
                Album
              </th>
            </tr>
          </thead>
          <tbody>
            {data.tracks.slice(0, 6).map((track) => (
              <tr key={track.id}>
                <td style={{ padding: "0.3rem 0.35rem", borderBottom: "1px solid var(--gs-border)" }}>
                  <a
                    href={track.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1a472a", textDecoration: "none" }}
                  >
                    {track.name}
                  </a>
                </td>
                <td style={{ padding: "0.3rem 0.35rem", borderBottom: "1px solid var(--gs-border)" }}>
                  {track.artist}
                </td>
                <td style={{ padding: "0.3rem 0.35rem", borderBottom: "1px solid var(--gs-border)" }}>
                  {track.albumName ?? "Unknown album"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p
          style={{
            margin: 0,
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            color: "#7a6f5d",
            fontSize: "0.82rem",
          }}
        >
          No tracks available for this mood yet.
        </p>
      )}
    </section>
  );
}
