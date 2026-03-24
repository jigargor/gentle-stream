/**
 * lib/games/feedPick.ts
 *
 * Picks a game type and difficulty for a feed slot.
 * Extracted here so NewsFeed stays decoupled from the game type list.
 *
 * Feed slots use `feedGamePickForOrdinal` so each game type (including crossword)
 * appears equally often over time: every block of N game slots contains each type
 * once, with order shuffled per block (deterministic seed) so runs still feel random.
 *
 * `randomFeedGamePick` is uniform over types for any legacy / one-off callers.
 */

import type { GameType, Difficulty } from "./types";

interface FeedGamePick {
  gameType: GameType;
  difficulty: Difficulty;
}

/** All types that can appear in the main feed rotation — equal share each cycle. */
const ALL_FEED_GAME_TYPES: GameType[] = [
  "sudoku",
  "word_search",
  "crossword",
  "connections",
  "killer_sudoku",
  "nonogram",
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
function shuffledGameTypesForCycle(cycle: number): GameType[] {
  const arr = [...ALL_FEED_GAME_TYPES];
  const rand = mulberry32((cycle + 1) * 1_000_003);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick for the n-th game section in the feed (0-based).
 * Each full cycle hits every game type exactly once; difficulty steps with the ordinal.
 */
export function feedGamePickForOrdinal(ordinal: number): FeedGamePick {
  const n = ALL_FEED_GAME_TYPES.length;
  const cycle = Math.floor(ordinal / n);
  const pos = ordinal % n;
  const gameType = shuffledGameTypesForCycle(cycle)[pos];
  const difficulty = DIFFICULTIES[ordinal % DIFFICULTIES.length];
  return { gameType, difficulty };
}

/** Deterministic pick so the same article always shows the same embedded game. */
export function embeddedGamePickFromSeed(seed: string): FeedGamePick {
  const h1 = hashStringToUint32(seed);
  const h2 = hashStringToUint32(`${seed}|diff`);
  return {
    gameType: ALL_FEED_GAME_TYPES[h1 % ALL_FEED_GAME_TYPES.length],
    difficulty: DIFFICULTIES[h2 % DIFFICULTIES.length],
  };
}

/** Uniform random type and difficulty (no feed history). */
export function randomFeedGamePick(): FeedGamePick {
  const gameType =
    ALL_FEED_GAME_TYPES[
      Math.floor(Math.random() * ALL_FEED_GAME_TYPES.length)
    ];
  const difficulty =
    DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
  return { gameType, difficulty };
}
