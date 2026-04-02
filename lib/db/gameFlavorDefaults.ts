/**
 * Static per–game-type defaults from `game_flavor_defaults` (see migration 020).
 * Replace with engagement-driven selection when user history / prefs are wired in.
 */

import { db } from "./client";
import type { Category } from "@gentle-stream/domain/constants";
import { CATEGORIES } from "@gentle-stream/domain/constants";

const FLAVOR_FALLBACK: Record<string, string> = {
  connections: "general",
  crossword: "general",
  word_search: "general",
};

/**
 * Pool filter for `games.flavor` — not tied to article feed categories.
 */
export async function getDefaultFlavorForGameType(
  gameType: string
): Promise<string> {
  const { data, error } = await db
    .from("game_flavor_defaults")
    .select("flavor")
    .eq("game_type", gameType)
    .maybeSingle();

  if (error) {
    console.warn("[gameFlavorDefaults] read failed:", error.message);
    return FLAVOR_FALLBACK[gameType] ?? "general";
  }

  const f = data?.flavor;
  if (typeof f === "string" && f.trim()) return f.trim();
  return FLAVOR_FALLBACK[gameType] ?? "general";
}

/**
 * Optional LLM / word-bank bias during ingest (not stored as pool category).
 */
export async function getPromptThemeForGameType(
  gameType: string
): Promise<Category> {
  const { data, error } = await db
    .from("game_flavor_defaults")
    .select("prompt_theme")
    .eq("game_type", gameType)
    .maybeSingle();

  if (!error && data?.prompt_theme && typeof data.prompt_theme === "string") {
    const t = data.prompt_theme.trim();
    if (CATEGORIES.includes(t as Category)) return t as Category;
  }

  return CATEGORIES[0]!;
}

/** Pool filter: explicit override (e.g. future per-user) or table default. */
export async function resolveGameFlavor(
  gameType: string,
  override?: string | null
): Promise<string> {
  if (override != null && String(override).trim() !== "") {
    return String(override).trim();
  }
  return getDefaultFlavorForGameType(gameType);
}
