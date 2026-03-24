import type { Difficulty } from "@/lib/games/types";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** New full-width feed game slot — random each time a section is appended (client-only). */
export function randomFeedGamePick(): {
  gameType: "sudoku" | "word_search";
  difficulty: Difficulty;
} {
  const gameType =
    Math.random() < 0.5 ? "sudoku" : "word_search";
  const difficulty =
    DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)]!;
  return { gameType, difficulty };
}

/**
 * Hero-column embed: stable per article so layout does not flicker or remount on re-render.
 * Distribution is pseudorandom across different seeds.
 */
export function embeddedGamePickFromSeed(seed: string): {
  gameType: "sudoku" | "word_search";
  difficulty: Difficulty;
} {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) % 6;
  const gameType = u < 3 ? "sudoku" : "word_search";
  const difficulty = DIFFICULTIES[(h >>> 8) % 3]!;
  return { gameType, difficulty };
}
