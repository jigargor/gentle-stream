import { picsumFallbackUrl, pollinationsImageUrl } from "@/lib/article-image";
import type { GeneratedImageModuleData } from "@/lib/types";

export interface ModulePolicyInput {
  seed: number;
  weatherWeight: number;
  spotifyWeight: number;
  spotifyEnabled: boolean;
  policy?: string;
}

export function chooseModuleTypeByPolicy(
  input: ModulePolicyInput
): "weather" | "spotify" {
  const policy = (input.policy ?? "hybrid").trim().toLowerCase();
  const spotifyAvailable =
    input.spotifyEnabled &&
    Boolean(process.env.SPOTIFY_CLIENT_ID?.trim()) &&
    Boolean(process.env.SPOTIFY_CLIENT_SECRET?.trim());

  if (!spotifyAvailable || policy === "weather_only") return "weather";
  if (policy === "spotify_only") return "spotify";

  const weatherWeight = Math.max(1, input.weatherWeight);
  const spotifyWeight = Math.max(1, input.spotifyWeight);
  const total = weatherWeight + spotifyWeight;
  const bucket = Math.abs(input.seed % total);
  return bucket < weatherWeight ? "weather" : "spotify";
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
