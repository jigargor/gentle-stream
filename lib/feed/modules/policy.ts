import { picsumFallbackUrl, pollinationsImageUrl } from "@/lib/article-image";
import type {
  GeneratedImageModuleData,
  IconFractalModuleData,
} from "@/lib/types";

const INLINE_BREATHER_MIN_GAP_PX = 145;
const INLINE_BREATHER_MAX_GAP_PX = 360;
const INLINE_ICON_FRACTAL_MIN_GAP_PX = 361;

export interface ModulePolicyInput {
  seed: number;
  weatherWeight: number;
  spotifyWeight: number;
  todoWeight?: number;
  spotifyEnabled: boolean;
  todoEnabled?: boolean;
  policy?: string;
}

export function chooseModuleTypeByPolicy(
  input: ModulePolicyInput
): "weather" | "spotify" | "todo" {
  const policy = (input.policy ?? "hybrid").trim().toLowerCase();
  const spotifyAvailable =
    input.spotifyEnabled &&
    Boolean(process.env.SPOTIFY_CLIENT_ID?.trim()) &&
    Boolean(process.env.SPOTIFY_CLIENT_SECRET?.trim());

  if (!spotifyAvailable || policy === "weather_only") return "weather";
  if (policy === "spotify_only") return "spotify";
  if (policy === "todo_only") return "todo";

  const weatherWeight = Math.max(1, input.weatherWeight);
  const spotifyWeight = spotifyAvailable ? Math.max(1, input.spotifyWeight) : 0;
  const todoWeight = input.todoEnabled ? Math.max(1, input.todoWeight ?? 1) : 0;
  const total = weatherWeight + spotifyWeight + todoWeight;
  const bucket = Math.abs(input.seed % total);
  if (bucket < weatherWeight) return "weather";
  if (bucket < weatherWeight + spotifyWeight) return "spotify";
  return "todo";
}

/** Gap / interval rows in the feed: todo vs generated illustration only. */
export function chooseGapIntervalModuleType(input: {
  seed: number;
  todoWeight: number;
  todoEnabled: boolean;
}): "todo" | "generated_art" {
  if (!input.todoEnabled) return "generated_art";
  const w = Math.max(1, input.todoWeight);
  const total = w + 1;
  const bucket = Math.abs(input.seed % total);
  return bucket < w ? "todo" : "generated_art";
}

/** Inline column balance: follow layout hint when todo is enabled. */
export function chooseInlineModuleType(input: {
  layoutHint: "generated_art" | "todo" | "editorial_breather";
  todoEnabled: boolean;
  inlineGapPx: number;
  residualGapPx: number;
}): "todo" | "generated_art" | "editorial_breather" | "icon_fractal" {
  // Small-to-medium gaps feel best with a subtle editorial breather.
  const effectiveGap = Math.max(input.inlineGapPx, input.residualGapPx);
  if (
    effectiveGap >= INLINE_BREATHER_MIN_GAP_PX &&
    effectiveGap <= INLINE_BREATHER_MAX_GAP_PX
  )
    return "editorial_breather";
  if (effectiveGap >= INLINE_ICON_FRACTAL_MIN_GAP_PX) return "icon_fractal";
  if (!input.todoEnabled) return "generated_art";
  return input.layoutHint === "todo" ? "todo" : "generated_art";
}

export function buildGeneratedImageModuleData(input: {
  category?: string | null;
  location?: string | null;
}): GeneratedImageModuleData {
  const location = (input.location ?? "").trim() || "Global";
  const category = (input.category ?? "").trim() || "feature";
  const seedKey = `${category}|${location}|inline-fun`;
  const prompt = `Editorial newspaper illustration, ${category} mood, ${location}, textured ink and watercolor, no text`;
  const pollinationsUrl =
    pollinationsImageUrl(prompt, 1200, 700, {
      category,
      location,
    });
  const primaryFallbackUrl = picsumFallbackUrl(seedKey, 1200, 700);
  const fallbackImageUrl = picsumFallbackUrl(`${seedKey}|curio-backup`, 1200, 700);
  const imageUrl = pollinationsUrl ?? primaryFallbackUrl;
  return {
    mode: "generated_art",
    title: "Daily Curio",
    subtitle: "A playful visual to fill the page rhythm.",
    imageUrl,
    fallbackImageUrl,
  };
}

export function buildIconFractalModuleData(input: {
  seed: number;
}): IconFractalModuleData {
  return {
    mode: "icon_fractal",
    seed: Math.abs(Math.trunc(input.seed)),
  };
}
