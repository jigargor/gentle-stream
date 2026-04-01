/**
 * lib/games/feedPick.ts
 *
 * Picks a game type and difficulty for a feed slot.
 * Extracted here so NewsFeed stays decoupled from the game type list.
 *
 * Feed slots use `feedGamePickForOrdinal` so each game type (crossword, sudoku, …)
 * appears equally often over time: every block of N game slots contains each type
 * once. Connections is excluded — it is a separate daily puzzle in NewsFeed (NYT-style).
 *
 * `randomFeedGamePick` is uniform over types for any legacy / one-off callers.
 */

import type { GameType, Difficulty } from "./types";

interface FeedGamePick {
  gameType: GameType;
  difficulty: Difficulty;
}

/**
 * Games in the rotating feed (Connections is NYT-style: one daily puzzle, handled
 * separately in NewsFeed — not part of this rotation).
 */
export const FEED_GAME_TYPES: GameType[] = [
  "sudoku",
  "word_search",
  "crossword",
  "killer_sudoku",
  "nonogram",
  "connections",
  "rabbit_hole",
];

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function hashStringToUint32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One permutation of game types per cycle index — fair counts, varied order. */
function shuffledGameTypesForCycle(cycle: number, enabled: GameType[]): GameType[] {
  const arr = [...enabled];
  const rand = mulberry32((cycle + 1) * 1_000_003);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeEnabledFeedGameTypes(enabledGameTypes?: GameType[]): GameType[] {
  if (!enabledGameTypes || enabledGameTypes.length === 0) return [...FEED_GAME_TYPES];
  const allow = new Set(FEED_GAME_TYPES);
  const out: GameType[] = [];
  const seen = new Set<GameType>();
  for (const t of enabledGameTypes) {
    if (!allow.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length > 0 ? out : [...FEED_GAME_TYPES];
}

/**
 * Pick for the n-th game section in the feed (0-based).
 * Each full cycle hits every game type exactly once; difficulty steps with the ordinal.
 */
export function feedGamePickForOrdinal(
  ordinal: number,
  enabledGameTypes?: GameType[]
): FeedGamePick {
  const enabled = normalizeEnabledFeedGameTypes(enabledGameTypes);
  const n = enabled.length;
  const cycle = Math.floor(ordinal / n);
  const pos = ordinal % n;
  const gameType = shuffledGameTypesForCycle(cycle, enabled)[pos];
  const difficulty = DIFFICULTIES[ordinal % DIFFICULTIES.length];
  return { gameType, difficulty };
}

/** Deterministic pick so the same article always shows the same embedded game. */
export function embeddedGamePickFromSeed(
  seed: string,
  enabledGameTypes?: GameType[]
): FeedGamePick {
  const h1 = hashStringToUint32(seed);
  const h2 = hashStringToUint32(`${seed}|diff`);
  const enabled = normalizeEnabledFeedGameTypes(enabledGameTypes);
  return {
    gameType: enabled[h1 % enabled.length],
    difficulty: DIFFICULTIES[h2 % DIFFICULTIES.length],
  };
}

/** Uniform random type and difficulty (no feed history). */
export function randomFeedGamePick(): FeedGamePick {
  const gameType =
    FEED_GAME_TYPES[Math.floor(Math.random() * FEED_GAME_TYPES.length)];
  const difficulty =
    DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
  return { gameType, difficulty };
}
