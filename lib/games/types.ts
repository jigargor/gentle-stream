// ─── Game types ───────────────────────────────────────────────────────────────

export type GameType =
  | "sudoku"
  | "killer_sudoku"
  | "word_search"
  | "nonogram"
  | "crossword"
  | "connections"
  | "cryptic"
  | "lateral";

export type Difficulty = "easy" | "medium" | "hard";

// ─── Sudoku ───────────────────────────────────────────────────────────────────

export interface SudokuPuzzle {
  given: number[][];
  solution: number[][];
  difficulty: Difficulty;
  givensCount: number;
}

// ─── Killer Sudoku ────────────────────────────────────────────────────────────

/**
 * A group of adjacent cells whose digits must sum to `sum`.
 * No digit may repeat within a cage.
 */
export interface Cage {
  id: number;
  cells: [number, number][];  // [row, col] pairs
  sum: number;
}

/**
 * Killer Sudoku puzzle.
 * No given digits — the only constraints are the cage sums.
 * `solution` is included for client-side validation on completion.
 */
export interface KillerSudokuPuzzle {
  solution: number[][];   // 9×9, fully solved
  cages: Cage[];
  difficulty: Difficulty;
}

// ─── Word Search ──────────────────────────────────────────────────────────────

export type Direction =
  | "E" | "W" | "N" | "S"
  | "NE" | "NW" | "SE" | "SW";

export interface PlacedWord {
  word: string;
  row: number;         // start row
  col: number;         // start col
  direction: Direction;
  found: boolean;      // client state — has the player found this word?
}

/**
 * A word search puzzle.
 * - `grid`: rows × cols array of uppercase letters
 * - `words`: the words hidden in the grid, with their positions
 * - `theme`: optional category label shown to the player ("Ocean Life", etc.)
 */
export interface WordSearchPuzzle {
  grid: string[][];
  words: PlacedWord[];
  rows: number;
  cols: number;
  theme: string;
  difficulty: Difficulty;
}

// ─── Nonogram (Picross) ───────────────────────────────────────────────────────

/**
 * A nonogram puzzle.
 * - `solution`: the correct filled/empty state for each cell
 * - `rowClues`: run-length clues for each row
 * - `colClues`: run-length clues for each column
 * - A clue of [0] means the row/column is entirely empty
 */
export interface NonogramPuzzle {
  solution: boolean[][];
  rowClues: number[][];
  colClues: number[][];
  rows: number;
  cols: number;
  difficulty: Difficulty;
}

// ─── Feed slot ────────────────────────────────────────────────────────────────

export type FeedSectionType = "articles" | "game";

export interface GameFeedSlot {
  sectionType: "game";
  gameType: GameType;
  index: number;
}
