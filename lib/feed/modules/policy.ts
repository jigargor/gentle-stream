import { picsumFallbackUrl, pollinationsImageUrl } from "@/lib/article-image";
import type { GeneratedImageModuleData } from "@/lib/types";

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
  layoutHint: "generated_art" | "todo";
  todoEnabled: boolean;
}): "todo" | "generated_art" {
  if (!input.todoEnabled) return "generated_art";
  return input.layoutHint === "todo" ? "todo" : "generated_art";
}

export function buildGeneratedImageModuleData(input: {
  category?: string | null;
  location?: string | null;
}): GeneratedImageModuleData {
  const location = (input.location ?? "").trim() || "Global";
  const category = (input.category ?? "").trim() || "feature";
  const prompt = `Editorial newspaper illustration, ${category} mood, ${location}, textured ink and watercolor, no text`;
  const imageUrl =
    pollinationsImageUrl(prompt, 1200, 700, {
      category,
      location,
    }) ?? picsumFallbackUrl(`${category}|${location}|inline-fun`, 1200, 700);
  return {
    mode: "generated_art",
    title: "Daily Curio",
    subtitle: "A playful visual to fill the page rhythm.",
    imageUrl,
  };
}
