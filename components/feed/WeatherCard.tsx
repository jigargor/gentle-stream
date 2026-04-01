"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { WeatherFillerData } from "@/lib/types";
import { picsumFallbackUrl } from "@/lib/article-image";
import PlaceAutocompleteInput from "@/components/location/PlaceAutocompleteInput";

interface WeatherCardProps {
  data: WeatherFillerData;
  reason: "gap" | "interval" | "singleton";
  weatherUnitSystem?: "metric" | "imperial";
  embedded?: boolean;
}

interface WeatherPanel {
  id: string;
  title: string;
  content: ReactNode;
}

type HoverHalf = "left" | "right" | null;

export function getWeatherPanelIds(data: WeatherFillerData): string[] {
  if (data.mode !== "weather") return [];
  const panelIds = ["summary", "details", "alerts"];
  if ((data.hourly ?? []).length > 0) panelIds.push("hourly");
  if ((data.daily ?? []).length > 0) panelIds.push("weekly");
  return panelIds;
}

function weatherEmoji(condition: string | undefined): string {
  const value = (condition ?? "").toLowerCase();
  if (value.includes("thunder")) return "⛈";
  if (value.includes("snow")) return "❄";
  if (value.includes("rain") || value.includes("drizzle")) return "🌧";
  if (value.includes("cloud")) return "☁";
  if (value.includes("fog") || value.includes("mist") || value.includes("haze")) return "🌫";
  if (value.includes("clear") || value.includes("sun")) return "☀";
  return "⛅";
}

function weatherIllustrationPath(condition: string | undefined): string {
  const value = (condition ?? "").toLowerCase();
  if (value.includes("thunder")) return "/weather-icons/storm.svg";
  if (value.includes("snow")) return "/weather-icons/snow.svg";
  if (value.includes("rain") || value.includes("drizzle")) return "/weather-icons/rain.svg";
  if (value.includes("overcast")) return "/weather-icons/overcast.svg";
  if (value.includes("cloud")) return "/weather-icons/cloud.svg";
  if (value.includes("fog") || value.includes("mist") || value.includes("haze")) return "/weather-icons/mist.svg";
  if (value.includes("clear") || value.includes("sun")) return "/weather-icons/sun.svg";
  return "/weather-icons/partly-cloudy.svg";
}

function readTruthyFlag(input: string | undefined, defaultValue: boolean): boolean {
  if (typeof input !== "string") return defaultValue;
  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function convertFromCelsius(valueC: number, unitSystem: "metric" | "imperial"): number {
  if (unitSystem === "metric") return valueC;
  return (valueC * 9) / 5 + 32;
}

function formatTemperature(
  valueC: number | undefined,
  unitSystem: "metric" | "imperial"
): string {
  if (typeof valueC !== "number") return "--";
  const unitLabel = unitSystem === "metric" ? "C" : "F";
  return `${Math.round(convertFromCelsius(valueC, unitSystem))}\u00b0${unitLabel}`;
}

function formatWindSpeed(
  valueKph: number | undefined,
  unitSystem: "metric" | "imperial"
): string {
  if (typeof valueKph !== "number") return "--";
  if (unitSystem === "metric") return `${Math.round(valueKph)} km/h`;
  const mph = valueKph / 1.60934;
  return `${Math.round(mph)} mph`;
}

function formatPrecipAmount(
  valueMm: number | undefined,
  unitSystem: "metric" | "imperial"
): string {
  if (typeof valueMm !== "number") return "--";
  if (unitSystem === "metric") return `${Math.round(valueMm * 10) / 10} mm`;
  const inches = valueMm / 25.4;
  return `${Math.round(inches * 100) / 100} in`;
}

function formatVisibility(
  valueKm: number | undefined,
  unitSystem: "metric" | "imperial"
): string {
  if (typeof valueKm !== "number") return "--";
  if (unitSystem === "metric") return `${Math.round(valueKm * 10) / 10} km`;
  const miles = valueKm / 1.60934;
  return `${Math.round(miles * 10) / 10} mi`;
}

function getTimeZoneAbbreviation(date: Date, timezoneIana: string | undefined): string {
  if (!timezoneIana) return "";
  try {
    const parts = new Intl.DateTimeFormat([], {
      timeZone: timezoneIana,
      timeZoneName: "short",
    }).formatToParts(date);
    const tz = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    return tz;
  } catch {
    return "";
  }
}

function isInteractiveElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, input, textarea, select, a, [role="combobox"], [role="option"], [data-place-autocomplete="true"]'
    )
  );
}

export default function WeatherCard({
  data,
  reason,
  weatherUnitSystem,
  embedded = false,
}: WeatherCardProps) {
  const googlePlacesApiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";
  const placesAutofillFlag = readTruthyFlag(
    process.env.NEXT_PUBLIC_GOOGLE_PLACES_AUTOFILL_ENABLED,
    false
  );
  const isPlacesAutofillEnabled =
    placesAutofillFlag && googlePlacesApiKey.length > 0;
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
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [activePanel, setActivePanel] = useState(0);
  const [pointerStartX, setPointerStartX] = useState<number | null>(null);
  const [hoveredArrow, setHoveredArrow] = useState<"prev" | "next" | null>(null);
  const [hoverHalf, setHoverHalf] = useState<HoverHalf>(null);
  const [panelClock, setPanelClock] = useState(() => new Date());

  useEffect(() => {
    setWeatherData(data);
    setImgSrc(data.imageUrl ?? null);
    setLocationInput(data.locationLabel ?? "");
    setIsEditingLocation(false);
    setActivePanel(0);
  }, [data]);

  useEffect(() => {
    const timerId = window.setInterval(() => setPanelClock(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

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
    } finally {
      setUpdatingLocation(false);
    }
  }

  const alerts = weatherData.alerts ?? [];
  const hourly = weatherData.hourly ?? [];
  const daily = weatherData.daily ?? [];
  const panelIds = getWeatherPanelIds(weatherData);
  const locationTimeZone = weatherData.timezoneIana;
  const resolvedUnitSystem: "metric" | "imperial" =
    weatherUnitSystem ??
    (typeof window !== "undefined" &&
    window.localStorage.getItem("gentle_stream_weather_unit_system") === "imperial"
      ? "imperial"
      : "metric");

  const summaryPanel = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr",
        gap: "0.9rem",
        alignItems: "start",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.8rem",
              lineHeight: 1.05,
              color: "#1e1e1e",
            }}
          >
            {formatTemperature(weatherData.temperatureC, resolvedUnitSystem)}
          </p>
        </div>
        <p
          style={{
            margin: "0.3rem 0 0",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            color: "#463f34",
            fontSize: "0.95rem",
          }}
        >
          {(weatherData.condition ?? "Calm skies").replace(/^\w/, (char) =>
            char.toUpperCase()
          )}
        </p>
        <img
          src={weatherIllustrationPath(weatherData.condition)}
          alt={weatherData.condition ? `${weatherData.condition} illustration` : "Weather illustration"}
          style={{
            marginTop: "0.35rem",
            width: "4.4rem",
            height: "4.4rem",
            objectFit: "contain",
            opacity: 0.92,
          }}
        />
      </div>

      <div
        style={{
          borderLeft: "1px solid var(--gs-border)",
          paddingLeft: "0.8rem",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          fontSize: "0.8rem",
          color: "#4a443a",
          lineHeight: 1.6,
        }}
      >
        <div>
          Humidity:{" "}
          {typeof weatherData.humidity === "number" ? `${weatherData.humidity}%` : "--"}
        </div>
        <div>
          Wind:{" "}
          {formatWindSpeed(weatherData.windKph, resolvedUnitSystem)}
        </div>
        <div style={{ marginTop: "0.25rem", color: "#7d735f" }}>{weatherData.subtitle}</div>
      </div>
    </div>
  );

  const detailsPanel = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "0.55rem",
      }}
    >
      <div style={{ border: "1px solid var(--gs-border)", borderRadius: "var(--gs-radius-sm)", padding: "0.42rem 0.5rem", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "0.8rem", color: "#433c31", background: "rgba(255,255,255,0.46)" }}>
        Feels like:{" "}
        {formatTemperature(weatherData.feelsLikeC, resolvedUnitSystem)}
      </div>
      <div style={{ border: "1px solid var(--gs-border)", borderRadius: "var(--gs-radius-sm)", padding: "0.42rem 0.5rem", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "0.8rem", color: "#433c31", background: "rgba(255,255,255,0.46)" }}>
        Precip chance:{" "}
        {typeof weatherData.precipChancePct === "number" ? `${weatherData.precipChancePct}%` : "--"}
      </div>
      <div style={{ border: "1px solid var(--gs-border)", borderRadius: "var(--gs-radius-sm)", padding: "0.42rem 0.5rem", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "0.8rem", color: "#433c31", background: "rgba(255,255,255,0.46)" }}>
        Precip amount:{" "}
        {formatPrecipAmount(weatherData.precipAmountMm, resolvedUnitSystem)}
      </div>
      <div style={{ border: "1px solid var(--gs-border)", borderRadius: "var(--gs-radius-sm)", padding: "0.42rem 0.5rem", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "0.8rem", color: "#433c31", background: "rgba(255,255,255,0.46)" }}>
        Visibility:{" "}
        {formatVisibility(weatherData.visibilityKm, resolvedUnitSystem)}
      </div>
      <div style={{ border: "1px solid var(--gs-border)", borderRadius: "var(--gs-radius-sm)", padding: "0.42rem 0.5rem", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "0.8rem", color: "#433c31", background: "rgba(255,255,255,0.46)" }}>
        Cloud cover:{" "}
        {typeof weatherData.cloudCoverPct === "number" ? `${weatherData.cloudCoverPct}%` : "--"}
      </div>
      <div style={{ border: "1px solid var(--gs-border)", borderRadius: "var(--gs-radius-sm)", padding: "0.42rem 0.5rem", fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: "0.8rem", color: "#433c31", background: "rgba(255,255,255,0.46)" }}>
        Wind:{" "}
        {formatWindSpeed(weatherData.windKph, resolvedUnitSystem)}
      </div>
    </div>
  );

  const alertsPanel = (
    <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      {alerts.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#5a5245" }}>No active alerts.</p>
      ) : (
        alerts.map((alert, idx) => (
          <div
            key={`${alert.title}-${idx}`}
            style={{
              border: "1px solid var(--gs-border)",
              borderRadius: "var(--gs-radius-sm)",
              background: "#fff8ef",
              padding: "0.5rem 0.55rem",
              marginBottom: "0.45rem",
            }}
          >
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 700,
                fontSize: "0.84rem",
                color: "#2a241c",
              }}
            >
              {alert.title}
            </div>
            {alert.severity ? (
              <div style={{ fontSize: "0.72rem", color: "#6d614f", marginTop: "0.15rem" }}>
                {alert.severity}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );

  const hourlyPanel = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "0.45rem",
      }}
    >
      {hourly.slice(0, 8).map((entry) => (
        <div
          key={entry.isoTime}
          style={{
            border: "1px solid var(--gs-border)",
            background: "linear-gradient(180deg, #fcf8ef 0%, #f4eddf 100%)",
            borderRadius: "var(--gs-radius-sm)",
            padding: "0.45rem 0.42rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.15rem",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            color: "#3e382f",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "#6f6554" }}>
            {new Date(entry.isoTime).toLocaleTimeString([], {
              hour: "numeric",
              timeZone: locationTimeZone,
            })}
          </span>
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>{weatherEmoji(entry.condition)}</span>
          <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>
            {formatTemperature(entry.tempC, resolvedUnitSystem)}
          </span>
          <span>
            {typeof entry.precipChancePct === "number" ? `${entry.precipChancePct}%` : "--"}
          </span>
        </div>
      ))}
    </div>
  );

  const weeklyPanel = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "0.45rem",
        justifyContent: "center",
      }}
    >
      {daily.slice(0, 7).map((entry) => (
        <div
          key={entry.isoDate}
          style={{
            border: "1px solid var(--gs-border)",
            background: "linear-gradient(180deg, #fcf8ef 0%, #f4eddf 100%)",
            borderRadius: "var(--gs-radius-sm)",
            padding: "0.5rem 0.45rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.18rem",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            color: "#3e382f",
          }}
        >
          <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
            {new Date(entry.isoDate).toLocaleDateString([], { weekday: "short" })}
          </span>
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>{weatherEmoji(entry.condition)}</span>
          <span>
            {formatTemperature(entry.minC, resolvedUnitSystem)} / {formatTemperature(entry.maxC, resolvedUnitSystem)}
          </span>
          <span style={{ fontSize: "0.7rem", color: "#6f6554" }}>
            {typeof entry.precipChancePct === "number" ? `${entry.precipChancePct}%` : "--"}
          </span>
        </div>
      ))}
    </div>
  );

  const panels: WeatherPanel[] = [
    { id: "summary", title: "Now", content: summaryPanel },
    { id: "details", title: "Precipitation", content: detailsPanel },
    ...(panelIds.includes("alerts")
      ? [{ id: "alerts", title: "Alerts", content: alertsPanel }]
      : []),
    ...(panelIds.includes("hourly")
      ? [{ id: "hourly", title: "Hourly", content: hourlyPanel }]
      : []),
    ...(panelIds.includes("weekly")
      ? [{ id: "weekly", title: "Weekly", content: weeklyPanel }]
      : []),
  ];

  const boundedPanel = Math.max(0, Math.min(activePanel, panels.length - 1));
  const activePanelData = panels[boundedPanel]!;
  const locationDateTimeLabel = panelClock.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: locationTimeZone,
  });
  const locationTzAbbr = getTimeZoneAbbreviation(panelClock, locationTimeZone);
  const utcTimeLabel = panelClock.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: true,
  });
  const panelTitle =
    activePanelData.id === "summary"
      ? `${activePanelData.title} · ${locationDateTimeLabel}${locationTzAbbr ? ` ${locationTzAbbr}` : ""} · ${utcTimeLabel} UTC`
      : activePanelData.title;

  function movePanel(direction: -1 | 1) {
    setActivePanel((current) => {
      if (panels.length <= 1) return 0;
      if (direction === 1) return (current + 1) % panels.length;
      return (current - 1 + panels.length) % panels.length;
    });
  }

  return (
    <section
      className="gs-card-lift"
      style={{
        borderTop: embedded ? "none" : "3px double var(--gs-ink-strong)",
        borderBottom: embedded ? "none" : "2px solid var(--gs-ink-strong)",
        borderLeft: embedded ? "none" : "1px solid var(--gs-border)",
        borderRight: embedded ? "none" : "1px solid var(--gs-border)",
        borderRadius: "var(--gs-radius-md)",
        background:
          "radial-gradient(circle at 10% 10%, #fff8e8 0%, #f6f0e2 38%, #f0e9db 100%)",
        padding: "0.95rem 1rem",
        boxShadow: embedded
          ? "inset 0 0 0 1px rgba(94,83,62,0.06), inset 0 14px 28px rgba(255,255,255,0.3)"
          : "0 8px 20px rgba(20, 15, 10, 0.1), inset 0 0 0 1px rgba(94,83,62,0.08), inset 0 14px 28px rgba(255,255,255,0.35)",
      }}
      aria-label="Weather card"
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
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
          {weatherData.title}
        </h3>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.12rem",
            minWidth: 0,
          }}
        >
          {isEditingLocation ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", minWidth: 0 }}>
              <div style={{ width: "12.2rem" }}>
                {isPlacesAutofillEnabled ? (
                  <PlaceAutocompleteInput
                    value={locationInput}
                    onChange={(nextValue) => setLocationInput(nextValue)}
                    onSelect={(selection) => setLocationInput(selection.label)}
                    ariaLabel="Weather tile location"
                    placeholder="Set location"
                    inputStyle={{
                      border: "1px solid var(--gs-border)",
                      padding: "0.16rem 0.3rem",
                      fontSize: "0.64rem",
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                    listStyle={{
                      maxHeight: "10rem",
                    }}
                  />
                ) : (
                  <input
                    value={locationInput}
                    onChange={(event) => setLocationInput(event.target.value)}
                    placeholder="Set location"
                    style={{
                      border: "1px solid var(--gs-border)",
                      padding: "0.16rem 0.3rem",
                      fontSize: "0.64rem",
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await updateLocation();
                  setIsEditingLocation(false);
                }}
                disabled={updatingLocation}
                aria-label="Save weather location"
                title="Save weather location"
                style={{
                  border: "1px solid var(--gs-border)",
                  background: "#f7f3ea",
                  color: "#6a614f",
                  minWidth: "1.55rem",
                  height: "1.05rem",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: updatingLocation ? "wait" : "pointer",
                  padding: "0 0.28rem",
                  lineHeight: 1,
                  flex: "0 0 auto",
                  fontSize: "0.6rem",
                }}
              >
                {updatingLocation ? "..." : "Save"}
              </button>
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", minWidth: 0 }}>
              <span
                style={{
                  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  fontSize: "0.66rem",
                  color: "#6a614f",
                  maxWidth: "12rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {weatherData.locationLabel ?? "Global"}
              </span>
              <button
                type="button"
                onClick={() => setIsEditingLocation(true)}
                aria-label="Edit weather location"
                title="Edit weather location"
                style={{
                  border: "1px solid var(--gs-border)",
                  background: "#f7f3ea",
                  color: "#6a614f",
                  width: "1.05rem",
                  height: "1.05rem",
                  borderRadius: "999px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  flex: "0 0 auto",
                }}
              >
                ✎
              </button>
            </div>
          )}
          {reasonLabel ? (
            <span
              style={{
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.62rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#746a55",
              }}
            >
              {reasonLabel}
            </span>
          ) : null}
        </div>
      </header>

      {isWeather ? (
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label="Detailed weather panels"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              movePanel(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              movePanel(1);
            }
          }}
          onPointerDown={(event) => setPointerStartX(event.clientX)}
          onPointerUp={(event) => {
            if (pointerStartX == null) return;
            const delta = event.clientX - pointerStartX;
            const absDelta = Math.abs(delta);
            if (absDelta > 35) {
              movePanel(delta < 0 ? 1 : -1);
              setPointerStartX(null);
              return;
            }
            if (!isInteractiveElement(event.target)) {
              const rect = event.currentTarget.getBoundingClientRect();
              const isLeftHalf = event.clientX < rect.left + rect.width / 2;
              movePanel(isLeftHalf ? -1 : 1);
            }
            setPointerStartX(null);
          }}
          onPointerCancel={() => setPointerStartX(null)}
          onMouseMove={(event) => {
            if (isInteractiveElement(event.target)) {
              setHoverHalf(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setHoverHalf(event.clientX < rect.left + rect.width / 2 ? "left" : "right");
          }}
          onMouseLeave={() => setHoverHalf(null)}
          style={{
            minHeight: 240,
            touchAction: "pan-y",
            position: "relative",
            transition: "transform var(--gs-motion-normal) var(--gs-ease-spring)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "0.45rem",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  hoverHalf === "left"
                    ? "linear-gradient(90deg, rgba(45,44,40,0.08) 0%, rgba(45,44,40,0.03) 35%, rgba(45,44,40,0) 62%)"
                    : hoverHalf === "right"
                      ? "linear-gradient(270deg, rgba(45,44,40,0.08) 0%, rgba(45,44,40,0.03) 35%, rgba(45,44,40,0) 62%)"
                      : "none",
                transition: "background 180ms ease",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(125deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 38%, rgba(81,67,42,0.06) 100%)",
              }}
            />
            <button
              className="gs-focus-ring"
              type="button"
              onClick={() => movePanel(-1)}
              aria-label="Previous weather panel"
              onMouseEnter={() => setHoveredArrow("prev")}
              onMouseLeave={() => setHoveredArrow(null)}
              style={{
                position: "absolute",
                left: "0.25rem",
                top: "50%",
                transform:
                  hoveredArrow === "prev" || hoverHalf === "left"
                    ? "translateY(-50%) translateX(-5px) scale(1.08)"
                    : "translateY(-50%) translateX(0) scale(1)",
                border: "none",
                background: "transparent",
                width: "2.5rem",
                height: "2.5rem",
                cursor: "pointer",
                opacity: hoveredArrow === "prev" || hoverHalf === "left" ? 0.9 : 0.24,
                transition:
                  "opacity 180ms ease, transform 260ms var(--gs-ease-spring), background-color 220ms ease, box-shadow 220ms ease, filter 220ms ease",
                boxShadow: "none",
                backdropFilter: "none",
                filter:
                  hoveredArrow === "prev" || hoverHalf === "left"
                    ? "drop-shadow(0 6px 10px rgba(24,18,11,0.22))"
                    : "none",
                fontSize: "1.4rem",
                zIndex: 2,
              }}
            >
              ‹
            </button>
            <span
              aria-live="polite"
              style={{
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.66rem",
                letterSpacing: "0.04em",
                color: "#766a57",
                textAlign: "center",
                margin: "0 2.8rem",
              }}
            >
              {panelTitle}
            </span>
            <button
              className="gs-focus-ring"
              type="button"
              onClick={() => movePanel(1)}
              aria-label="Next weather panel"
              onMouseEnter={() => setHoveredArrow("next")}
              onMouseLeave={() => setHoveredArrow(null)}
              style={{
                position: "absolute",
                right: "0.25rem",
                top: "50%",
                transform:
                  hoveredArrow === "next" || hoverHalf === "right"
                    ? "translateY(-50%) translateX(5px) scale(1.08)"
                    : "translateY(-50%) translateX(0) scale(1)",
                border: "none",
                background: "transparent",
                width: "2.5rem",
                height: "2.5rem",
                cursor: "pointer",
                opacity: hoveredArrow === "next" || hoverHalf === "right" ? 0.9 : 0.24,
                transition:
                  "opacity 180ms ease, transform 260ms var(--gs-ease-spring), background-color 220ms ease, box-shadow 220ms ease, filter 220ms ease",
                boxShadow: "none",
                backdropFilter: "none",
                filter:
                  hoveredArrow === "next" || hoverHalf === "right"
                    ? "drop-shadow(0 6px 10px rgba(24,18,11,0.22))"
                    : "none",
                fontSize: "1.4rem",
                zIndex: 2,
              }}
            >
              ›
            </button>
          </div>
          <div style={{ minHeight: 180 }}>{activePanelData.content}</div>
          <div
            style={{
              marginTop: "0.45rem",
              display: "flex",
              justifyContent: "center",
              gap: "0.35rem",
            }}
          >
            {panels.map((panel, idx) => (
              <button
                className="gs-focus-ring"
                key={panel.id}
                type="button"
                aria-label={`Go to ${panel.title} panel`}
                onClick={() => setActivePanel(idx)}
                style={{
                  width: "0.5rem",
                  height: "0.5rem",
                  borderRadius: "999px",
                  border: idx === boundedPanel ? "1px solid rgba(0,0,0,0.2)" : "none",
                  background: idx === boundedPanel ? "#1f1f1f" : "#b6ab96",
                  cursor: "pointer",
                  padding: 0,
                  transform: idx === boundedPanel ? "scale(1.16)" : "scale(1)",
                  transition:
                    "transform var(--gs-motion-fast) var(--gs-ease-spring), background var(--gs-motion-fast) var(--gs-ease-standard)",
                }}
              />
            ))}
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
                border: "1px solid var(--gs-border)",
                borderRadius: "var(--gs-radius-sm)",
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
