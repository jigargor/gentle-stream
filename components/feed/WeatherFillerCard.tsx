"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeatherFillerData } from "@/lib/types";
import { picsumFallbackUrl } from "@/lib/article-image";

interface WeatherFillerCardProps {
  data: WeatherFillerData;
  reason: "gap" | "interval" | "singleton";
}

export default function WeatherFillerCard({ data, reason }: WeatherFillerCardProps) {
  const [weatherData, setWeatherData] = useState<WeatherFillerData>(data);
  const isWeather = weatherData.mode === "weather";
  const reasonLabel =
    reason === "singleton"
      ? null
      : reason === "gap"
        ? "gap-fill"
        : "interval";
  const fallbackSrc = useMemo(() => {
    const seed = weatherData.locationLabel?.trim() || "weather";
    return picsumFallbackUrl(`${seed}|forecast-desk`, 1200, 700);
  }, [weatherData.locationLabel]);
  const [imgSrc, setImgSrc] = useState<string | null>(weatherData.imageUrl ?? null);
  const [locationInput, setLocationInput] = useState(weatherData.locationLabel ?? "");
  const [updatingLocation, setUpdatingLocation] = useState(false);

  useEffect(() => {
    setWeatherData(data);
    setImgSrc(data.imageUrl ?? null);
    setLocationInput(data.locationLabel ?? "");
  }, [data]);

  async function updateLocation() {
    const location = locationInput.trim();
    if (!location) return;
    setUpdatingLocation(true);
    try {
      const params = new URLSearchParams({ location });
      const res = await fetch(`/api/feed/modules/weather?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { data?: WeatherFillerData };
      if (!res.ok || !body.data) return;
      setWeatherData(body.data);
      setImgSrc(body.data.imageUrl ?? null);
      setLocationInput(body.data.locationLabel ?? location);
      try {
        localStorage.setItem("gentle_stream_weather_location", location);
      } catch {
        /* ignore */
      }
    } finally {
      setUpdatingLocation(false);
    }
  }

  return (
    <section
      style={{
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#f7f3ea",
        padding: "0.95rem 1rem",
      }}
      aria-label="Weather filler module"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid #d7d0c1",
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
          {weatherData.title}
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

      {isWeather ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "0.9rem",
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.8rem",
                lineHeight: 1.05,
                color: "#1e1e1e",
              }}
            >
              {typeof weatherData.temperatureC === "number" ? `${weatherData.temperatureC}\u00b0C` : "--"}
            </p>
            <p
              style={{
                margin: "0.3rem 0 0",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: "italic",
                color: "#463f34",
                fontSize: "0.95rem",
              }}
            >
              {(weatherData.condition ?? "Calm skies").replace(/^\w/, (char) => char.toUpperCase())}
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.73rem",
                color: "#6d6353",
              }}
            >
              {weatherData.locationLabel ?? "Global desk"}
            </p>
            <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.35rem" }}>
              <input
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
                placeholder="Set location"
                style={{
                  border: "1px solid #d7d0c1",
                  padding: "0.18rem 0.32rem",
                  fontSize: "0.68rem",
                  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  minWidth: "9rem",
                }}
              />
              <button
                type="button"
                onClick={() => void updateLocation()}
                disabled={updatingLocation}
                style={{
                  border: "1px solid #1a1a1a",
                  background: "#faf8f3",
                  cursor: updatingLocation ? "wait" : "pointer",
                  fontSize: "0.64rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "0.16rem 0.38rem",
                }}
              >
                {updatingLocation ? "Updating..." : "Change"}
              </button>
            </div>
          </div>

          <div
            style={{
              borderLeft: "1px solid #ddd2bc",
              paddingLeft: "0.8rem",
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.8rem",
              color: "#4a443a",
              lineHeight: 1.6,
            }}
          >
            <div>Humidity: {typeof weatherData.humidity === "number" ? `${weatherData.humidity}%` : "--"}</div>
            <div>Wind: {typeof weatherData.windKph === "number" ? `${weatherData.windKph} km/h` : "--"}</div>
            <div style={{ marginTop: "0.25rem", color: "#7d735f" }}>{weatherData.subtitle}</div>
          </div>
        </div>
      ) : (
        <div>
          {(imgSrc || fallbackSrc) && (
            <img
              src={imgSrc ?? fallbackSrc}
              alt={weatherData.locationLabel ? `Generated weather illustration for ${weatherData.locationLabel}` : "Generated weather illustration"}
              loading="lazy"
              onError={() => setImgSrc(fallbackSrc)}
              style={{
                width: "100%",
                maxHeight: "220px",
                objectFit: "cover",
                border: "1px solid #d7d0c1",
                marginBottom: "0.55rem",
              }}
            />
          )}
          <p
            style={{
              margin: 0,
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              color: "#4f463b",
              fontSize: "0.92rem",
            }}
          >
            {weatherData.subtitle}
          </p>
        </div>
      )}
    </section>
  );
}
