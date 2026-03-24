/**
 * Word Search Generator
 *
 * Generates a themed word search grid, sized to difficulty.
 * Pure TypeScript — no dependencies, no API calls, runs in <5ms.
 *
 * Algorithm:
 *   1. Pick grid size and word count based on difficulty
 *   2. For each word, try random (position, direction) pairs until one fits
 *   3. Fill remaining cells with random letters, biased toward common letters
 *      so the grid reads naturally
 *
 * Word placement tries up to MAX_ATTEMPTS per word before skipping it, so
 * the generator never hangs on a tight grid.
 *
 * Difficulty:
 *   easy:   10×10 grid, 6 words, horizontal (E) and vertical (S) only
 *   medium: 13×13 grid, 8 words, E/S plus down-right and up-right diagonals (SE, NE)
 *   hard:   15×15 grid, 10 words, same forward-facing directions (RTL / backwards is a future mode)
 */

import type { WordSearchPuzzle, PlacedWord, Direction, Difficulty } from "./types";
import { DEFAULT_WORDS, WORD_BANKS } from "./wordSearchStaticBanks";

// ─── Configuration ────────────────────────────────────────────────────────────

export interface GridConfig {
  rows: number;
  cols: number;
  wordCount: number;
  directions: Direction[];
}

/** Forward reading only: LTR along rows, top-to-bottom along columns, diagonals that advance column (NE, SE). */
const CONFIG: Record<Difficulty, GridConfig> = {
  easy: {
    rows: 10,
    cols: 10,
    wordCount: 6,
    directions: ["E", "S"],
  },
  medium: {
    rows: 13,
    cols: 13,
    wordCount: 8,
    directions: ["E", "S", "NE", "SE"],
  },
  hard: {
    rows: 15,
    cols: 15,
    wordCount: 10,
    directions: ["E", "E", "S", "S", "NE", "SE"],
    // E and S doubled so axis-aligned words stay common on larger grids
  },
};

const MAX_ATTEMPTS_PER_WORD = 200;

// Direction deltas: [row delta, col delta]
const DELTAS: Record<Direction, [number, number]> = {
  E:  [0,  1],
  W:  [0, -1],
  N:  [-1, 0],
  S:  [1,  0],
  NE: [-1, 1],
  NW: [-1,-1],
  SE: [1,  1],
  SW: [1, -1],
};

// Filler letter distribution — weighted toward common English letters
const FILLER_POOL =
  "AAABBBCCCDDDEEEEEFFFGGGHHHIIIJJKKLLLMMMNNNNOOOOPPPQRRRRSSSSTTTTTUUUVVWWXYZ";

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WordSearchGeneratorOptions {
  category?: string;
  /** When provided, these words are used (length-filtered); overrides category bank */
  words?: string[];
}

export function getWordSearchGridConfig(difficulty: Difficulty): GridConfig {
  return CONFIG[difficulty];
}

export function generateWordSearch(
  difficulty: Difficulty = "medium",
  categoryOrOptions?: string | WordSearchGeneratorOptions
): WordSearchPuzzle {
  const opts: WordSearchGeneratorOptions =
    typeof categoryOrOptions === "string"
      ? { category: categoryOrOptions }
      : categoryOrOptions ?? {};

  const config = CONFIG[difficulty];
  const category = opts.category;
  const maxLen = Math.min(config.rows, config.cols) - 1;

  let bank: string[];
  if (opts.words?.length) {
    bank = Array.from(
      new Set(opts.words.map((w) => w.toUpperCase().trim()))
    ).filter(
      (w) => w.length >= 3 && w.length <= maxLen && /^[A-Z]+$/.test(w)
    );
  } else {
    bank =
      category && WORD_BANKS[category] ? WORD_BANKS[category] : DEFAULT_WORDS;
  }

  const filtered = bank.filter((w) => w.length >= 3 && w.length <= maxLen);
  const eligible = opts.words?.length ? filtered : shuffle(filtered);

  const target = eligible.slice(0, config.wordCount);

  // Build grid
  const grid: string[][] = Array.from({ length: config.rows }, () =>
    Array(config.cols).fill("")
  );

  const placed: PlacedWord[] = [];

  for (const word of target) {
    const p = tryPlace(grid, word, config);
    if (p) placed.push(p);
  }

  // Fill empty cells
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.cols; c++) {
      if (!grid[r][c]) {
        grid[r][c] = randomFiller();
      }
    }
  }

  const theme = category ?? "Word Search";

  return {
    grid,
    words: placed,
    rows: config.rows,
    cols: config.cols,
    theme,
    difficulty,
  };
}

// ─── Placement ────────────────────────────────────────────────────────────────

function tryPlace(
  grid: string[][],
  word: string,
  config: GridConfig
): PlacedWord | null {
  const dirs = config.directions;

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_WORD; attempt++) {
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const [dr, dc] = DELTAS[dir];

    // Compute valid start range so the word stays within the grid
    const minR = dr < 0 ? (word.length - 1) * Math.abs(dr) : 0;
    const maxR = dr > 0 ? config.rows - word.length * dr : config.rows - 1;
    const minC = dc < 0 ? (word.length - 1) * Math.abs(dc) : 0;
    const maxC = dc > 0 ? config.cols - word.length * dc : config.cols - 1;

    if (minR > maxR || minC > maxC) continue;

    const row = randInt(minR, maxR);
    const col = randInt(minC, maxC);

    if (canPlace(grid, word, row, col, dr, dc)) {
      // Commit
      for (let i = 0; i < word.length; i++) {
        grid[row + dr * i][col + dc * i] = word[i];
      }
      return { word, row, col, direction: dir, found: false };
    }
  }

  return null; // couldn't place — skip this word
}

function canPlace(
  grid: string[][],
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number
): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const existing = grid[r][c];
    // Cell must be empty OR already contain the same letter (shared letter)
    if (existing && existing !== word[i]) return false;
  }
  return true;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function randomFiller(): string {
  return FILLER_POOL[Math.floor(Math.random() * FILLER_POOL.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
