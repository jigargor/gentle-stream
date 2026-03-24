/**
 * lib/games/feedPick.ts
 *
 * Picks a game type and difficulty for a feed slot.
 * Extracted here so NewsFeed stays decoupled from the game type list.
 *
 * Weights:
 *   sudoku & word_search — appear most often (familiar, quick)
 *   killer_sudoku & nonogram — appear less often (more niche)
 *
 * Difficulty rotates easy → medium → hard across game slots using
 * a simple timestamp-seeded pick so consecutive slots aren't identical.
 */

import type { GameType, Difficulty } from "./types";

interface FeedGamePick {
  gameType: GameType;
  difficulty: Difficulty;
}

// Weighted pool — duplicates = higher probability
const GAME_POOL: GameType[] = [
  "sudoku",
  "word_search",
  "sudoku",
  "word_search",
  "killer_sudoku",
  "nonogram",
];

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export function randomFeedGamePick(): FeedGamePick {
  const gameType = GAME_POOL[Math.floor(Math.random() * GAME_POOL.length)];
  const difficulty = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
  return { gameType, difficulty };
}
