import { picsumFallbackUrl, pollinationsImageUrl } from "@/lib/article-image";
import { getEnv } from "@/lib/env";
import type {
  WeatherAlertItem,
  WeatherDailyItem,
  WeatherFillerData,
  WeatherHourlyItem,
} from "@gentle-stream/domain/types";

interface WeatherSnapshot {
  city: string;
  state?: string;
  country?: string;
  timezoneIana?: string;
  temperatureC: number;
  feelsLikeC?: number;
  condition: string;
  humidity: number;
  windKph: number;
  precipChancePct?: number;
  precipAmountMm?: number;
  visibilityKm?: number;
  cloudCoverPct?: number;
  alerts?: WeatherAlertItem[];
  hourly?: WeatherHourlyItem[];
  daily?: WeatherDailyItem[];
}

interface CachedEntry {
  expiresAt: number;
  data: WeatherFillerData;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 5_000;
const cache = new Map<string, CachedEntry>();
const env = getEnv();

const CATEGORY_DEFAULT_CITY: Record<string, string> = {
  world: "London",
  science: "Reykjavik",
  tech: "San Francisco",
  health: "Singapore",
  travel: "Barcelona",
  culture: "Paris",
  sports: "Los Angeles",
  games: "Tokyo",
};

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function defaultCityForCategory(category?: string | null): string {
  const key = normalizeToken(category);
  return CATEGORY_DEFAULT_CITY[key] ?? "New York";
}

function buildCacheKey(input: { location?: string | null; category?: string | null }): string {
  return `${normalizeToken(input.location)}|${normalizeToken(input.category)}`;
}

function buildCacheKeyWithCoords(input: {
  location?: string | null;
  category?: string | null;
  lat?: number;
  lon?: number;
}): string {
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    const lat = input.lat.toFixed(3);
    const lon = input.lon.toFixed(3);
    return `geo:${lat},${lon}|${normalizeToken(input.category)}`;
  }
  return buildCacheKey(input);
}

function withTimeout(signal: AbortSignal, ms: number): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      controller.abort();
    },
    { once: true }
  );
  return controller;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const parentController = new AbortController();
  const timeoutController = withTimeout(parentController.signal, timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
      signal: timeoutController.signal,
    });
    if (!res.ok) throw new Error(`Weather upstream failed (${res.status})`);
    return (await res.json()) as T;
  } finally {
    parentController.abort();
  }
}

async function resolveCoordinates(cityQuery: string, apiKey: string): Promise<{ lat: number; lon: number; city: string; state?: string; country?: string } | null> {
  const params = new URLSearchParams({
    q: cityQuery,
    limit: "1",
    appid: apiKey,
  });
  const url = `https://api.openweathermap.org/geo/1.0/direct?${params.toString()}`;
  const rows = await fetchJson<
    Array<{ lat: number; lon: number; name: string; state?: string; country?: string }>
  >(url, WEATHER_TIMEOUT_MS);
  const first = rows[0];
  if (!first) return null;
  return {
    lat: first.lat,
    lon: first.lon,
    city: first.name,
    state: first.state,
    country: first.country,
  };
}

async function reverseGeocode(
  lat: number,
  lon: number,
  apiKey: string
): Promise<{ city: string; state?: string; country?: string } | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    limit: "1",
    appid: apiKey,
  });
  const url = `https://api.openweathermap.org/geo/1.0/reverse?${params.toString()}`;
  const rows = await fetchJson<Array<{ name: string; state?: string; country?: string }>>(
    url,
    WEATHER_TIMEOUT_MS
  );
  const first = rows[0];
  if (!first) return null;
  return { city: first.name, state: first.state, country: first.country };
}

async function fetchOneCallWeather(lat: number, lon: number, apiKey: string): Promise<Omit<WeatherSnapshot, "city" | "country">> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: apiKey,
    units: "metric",
    exclude: "minutely",
  });
  // One Call API 3.0 provides current + hourly/daily forecasts in one response.
  const url = `https://api.openweathermap.org/data/3.0/onecall?${params.toString()}`;
  const data = await fetchJson<{
    timezone?: string;
    current?: {
      temp?: number;
      feels_like?: number;
      humidity?: number;
      wind_speed?: number;
      clouds?: number;
      visibility?: number;
      rain?: { "1h"?: number };
      snow?: { "1h"?: number };
      weather?: Array<{ description?: string }>;
    };
    hourly?: Array<{
      dt?: number;
      temp?: number;
      pop?: number;
      weather?: Array<{ description?: string }>;
    }>;
    daily?: Array<{
      dt?: number;
      pop?: number;
      temp?: { min?: number; max?: number };
      weather?: Array<{ description?: string }>;
    }>;
    alerts?: Array<{
      event?: string;
      start?: number;
      end?: number;
      sender_name?: string;
      tags?: string[];
    }>;
  }>(url, WEATHER_TIMEOUT_MS);
  const current = data.current ?? {};
  const hourly = (data.hourly ?? []).slice(0, 8);
  const daily = (data.daily ?? []).slice(0, 7);
  const alerts = (data.alerts ?? []).slice(0, 3);
  const precipAmountMm = (current.rain?.["1h"] ?? 0) + (current.snow?.["1h"] ?? 0);
  const precipChancePct =
    typeof hourly[0]?.pop === "number"
      ? Math.round(Math.max(0, Math.min(1, hourly[0].pop)) * 100)
      : undefined;

  return {
    timezoneIana: typeof data.timezone === "string" ? data.timezone : undefined,
    temperatureC: Math.round(current.temp ?? 0),
    feelsLikeC:
      typeof current.feels_like === "number" ? Math.round(current.feels_like) : undefined,
    condition: current.weather?.[0]?.description ?? "Clear skies",
    humidity: Math.round(current.humidity ?? 0),
    windKph: Math.round((current.wind_speed ?? 0) * 3.6),
    precipChancePct,
    precipAmountMm: precipAmountMm > 0 ? Math.round(precipAmountMm * 10) / 10 : 0,
    visibilityKm:
      typeof current.visibility === "number"
        ? Math.round((current.visibility / 1000) * 10) / 10
        : undefined,
    cloudCoverPct:
      typeof current.clouds === "number"
        ? Math.round(Math.max(0, Math.min(100, current.clouds)))
        : undefined,
    alerts: alerts.map((entry) => ({
      title: entry.event?.trim() || "Weather alert",
      severity:
        entry.tags && entry.tags.length > 0 ? entry.tags[0] : entry.sender_name || undefined,
      startsAt:
        typeof entry.start === "number" ? new Date(entry.start * 1000).toISOString() : undefined,
      endsAt:
        typeof entry.end === "number" ? new Date(entry.end * 1000).toISOString() : undefined,
    })),
    hourly: hourly
      .filter(
        (entry) =>
          typeof entry.dt === "number" &&
          typeof entry.temp === "number" &&
          Boolean(entry.weather?.[0]?.description)
      )
      .map((entry) => ({
        isoTime: new Date((entry.dt as number) * 1000).toISOString(),
        tempC: Math.round(entry.temp as number),
        condition: entry.weather?.[0]?.description ?? "Clear",
        precipChancePct:
          typeof entry.pop === "number"
            ? Math.round(Math.max(0, Math.min(1, entry.pop)) * 100)
            : undefined,
      })),
    daily: daily
      .filter(
        (entry) =>
          typeof entry.dt === "number" &&
          typeof entry.temp?.min === "number" &&
          typeof entry.temp?.max === "number" &&
          Boolean(entry.weather?.[0]?.description)
      )
      .map((entry) => ({
        isoDate: new Date((entry.dt as number) * 1000).toISOString(),
        minC: Math.round(entry.temp?.min as number),
        maxC: Math.round(entry.temp?.max as number),
        condition: entry.weather?.[0]?.description ?? "Clear",
        precipChancePct:
          typeof entry.pop === "number"
            ? Math.round(Math.max(0, Math.min(1, entry.pop)) * 100)
            : undefined,
      })),
  };
}

function fallbackArtData(input: {
  location?: string | null;
  category?: string | null;
}): WeatherFillerData {
  const fallbackMode =
    env.NEXT_PUBLIC_FEED_FILLER_FALLBACK?.trim().toLowerCase() ??
    "generated_art";
  const city = (input.location ?? "").trim() || defaultCityForCategory(input.category);
  if (fallbackMode !== "generated_art") {
    return {
      mode: "generated_art",
      title: "Forecast Desk",
      subtitle: "Live weather unavailable. Generated-art fallback is disabled by config.",
      locationLabel: city,
      imageUrl: picsumFallbackUrl(`${city}|weather-fallback-disabled`, 1200, 700),
    };
  }
  const prompt = `Atmospheric editorial illustration of ${city} weather patterns, warm newspaper palette, subtle texture, no text`;
  const imageUrl =
    pollinationsImageUrl(prompt, 1200, 700, {
      category: input.category ?? null,
      location: city,
    }) ?? picsumFallbackUrl(`${city}|${input.category ?? "weather-fallback"}`, 1200, 700);

  return {
    mode: "generated_art",
    title: "Forecast Desk",
    subtitle: "Live weather unavailable. Editorial illustration keeps the page full.",
    locationLabel: city,
    imageUrl,
  };
}

function weatherDataToCard(snapshot: WeatherSnapshot): WeatherFillerData {
  const labelParts = [snapshot.city, snapshot.state, snapshot.country]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  const locationLabel = labelParts.length > 0 ? labelParts.join(", ") : "Global";
  return {
    mode: "weather",
    title: "Weather Brief",
    subtitle: "",
    locationLabel,
    timezoneIana: snapshot.timezoneIana,
    temperatureC: snapshot.temperatureC,
    condition: snapshot.condition,
    humidity: snapshot.humidity,
    windKph: snapshot.windKph,
    feelsLikeC: snapshot.feelsLikeC,
    precipChancePct: snapshot.precipChancePct,
    precipAmountMm: snapshot.precipAmountMm,
    visibilityKm: snapshot.visibilityKm,
    cloudCoverPct: snapshot.cloudCoverPct,
    alerts: snapshot.alerts,
    hourly: snapshot.hourly,
    daily: snapshot.daily,
  };
}

async function fetchDefaultLocationWeather(input: {
  category?: string | null;
  apiKey: string;
}): Promise<WeatherFillerData | null> {
  const defaultCity = defaultCityForCategory(input.category);
  const geocoded = await resolveCoordinates(defaultCity, input.apiKey);
  if (!geocoded) return null;
  const onecall = await fetchOneCallWeather(geocoded.lat, geocoded.lon, input.apiKey);
  const snapshot: WeatherSnapshot = {
    city: geocoded.city,
    state: geocoded.state,
    country: geocoded.country,
    ...onecall,
  };
  return weatherDataToCard(snapshot);
}

export async function getWeatherFillerData(input: {
  location?: string | null;
  category?: string | null;
  lat?: number;
  lon?: number;
}): Promise<WeatherFillerData> {
  const cacheKey = buildCacheKeyWithCoords(input);
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  const apiKey = env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[weather-module] OPENWEATHER_API_KEY is missing; serving generated_art fallback.");
    const fallback = fallbackArtData(input);
    return fallback;
  }

  try {
    if (typeof input.lat === "number" && typeof input.lon === "number") {
      const [place, onecall] = await Promise.all([
        reverseGeocode(input.lat, input.lon, apiKey),
        fetchOneCallWeather(input.lat, input.lon, apiKey),
      ]);
      const snapshot: WeatherSnapshot = {
        city: place?.city ?? "Local",
        state: place?.state,
        country: place?.country,
        ...onecall,
      };
      const data = weatherDataToCard(snapshot);
      cache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
      return data;
    }
    const requestedCity = (input.location ?? "").trim();
    const defaultCity = defaultCityForCategory(input.category);
    const city = requestedCity || defaultCity;
    let geocoded = await resolveCoordinates(city, apiKey);
    if (!geocoded && requestedCity) {
      console.warn(
        `[weather-module] Geocoding returned no results for location="${city}". Retrying with default city="${defaultCity}".`
      );
      geocoded = await resolveCoordinates(defaultCity, apiKey);
    }
    if (!geocoded) {
      console.warn(
        `[weather-module] Geocoding returned no results for both location="${city}" and default city="${defaultCity}". Serving fallback.`
      );
      const fallback = fallbackArtData(input);
      return fallback;
    }
    const onecall = await fetchOneCallWeather(geocoded.lat, geocoded.lon, apiKey);
    const snapshot: WeatherSnapshot = {
      city: geocoded.city,
      state: geocoded.state,
      country: geocoded.country,
      ...onecall,
    };
    const data = weatherDataToCard({
      ...snapshot,
      city: geocoded.city || snapshot.city,
      state: geocoded.state || snapshot.state,
      country: geocoded.country || snapshot.country,
    });
    cache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[weather-module] One Call fetch failed: ${message}. Retrying with default location.`
    );
    try {
      const fallbackWeather = await fetchDefaultLocationWeather({
        category: input.category,
        apiKey,
      });
      if (fallbackWeather) {
        cache.set(cacheKey, { data: fallbackWeather, expiresAt: now + CACHE_TTL_MS });
        return fallbackWeather;
      }
    } catch (retryError) {
      const retryMessage =
        retryError instanceof Error ? retryError.message : String(retryError);
      console.warn(
        `[weather-module] Default-location retry failed: ${retryMessage}. Serving fallback art.`
      );
    }
    const fallback = fallbackArtData(input);
    return fallback;
  }
}
