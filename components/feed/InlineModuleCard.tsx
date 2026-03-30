"use client";

import type {
  FeedModuleData,
  SpotifyMoodTileData,
  WeatherModuleData,
} from "@/lib/types";

interface InlineModuleCardProps {
  moduleType: "weather" | "spotify" | "generated_art" | "nasa";
  data: FeedModuleData;
}

export default function InlineModuleCard({
  moduleType,
  data,
}: InlineModuleCardProps) {
  const spotifyData =
    moduleType === "spotify" && "tracks" in data
      ? (data as SpotifyMoodTileData)
      : null;
  if (spotifyData) {
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
            marginBottom: "0.35rem",
          }}
        >
          {spotifyData.title}
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.7rem",
            color: "#4c463d",
            lineHeight: 1.4,
          }}
        >
          {spotifyData.tracks.slice(0, 2).map((track) => (
            <div key={track.id}>
              {track.name} - {track.artist}
            </div>
          ))}
        </div>
      </aside>
    );
  }

  const weatherData =
    moduleType === "weather" && "mode" in data
      ? (data as WeatherModuleData)
      : null;
  if (weatherData) {
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
          {weatherData.title}
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.72rem",
            color: "#4c463d",
            lineHeight: 1.4,
          }}
        >
          <div>
            {typeof weatherData.temperatureC === "number"
              ? `${weatherData.temperatureC}\u00b0C`
              : "Weather brief"}
            {weatherData.condition ? ` · ${weatherData.condition}` : ""}
          </div>
          <div>{weatherData.locationLabel ?? weatherData.subtitle}</div>
        </div>
      </aside>
    );
  }

  if ("imageUrl" in data && typeof data.imageUrl === "string") {
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
          {data.title}
        </div>
        <img
          src={data.imageUrl}
          alt={data.title}
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
