// ─── Game types ───────────────────────────────────────────────────────────────

export type GameType =
  | "sudoku"
  | "killer_sudoku"
  | "word_search"
  | "nonogram"
  | "crossword"
  | "connections"
  | "rabbit_hole"
  | "cryptic"
  | "lateral";

export type Difficulty = "easy" | "medium" | "hard";

// ─── Sudoku ───────────────────────────────────────────────────────────────────

export interface SudokuPuzzle {
  given: number[][];
  solution: number[][];
  difficulty: Difficulty;
  givensCount: number;
  uniquenessSignature?: string;
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
  uniquenessSignature?: string;
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
  /** Stable content signature used to reduce repeat puzzles in the feed. */
  uniquenessSignature?: string;
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
  uniquenessSignature?: string;
}

// ─── Crossword ────────────────────────────────────────────────────────────────

export interface CrosswordSlot {
  number: number;
  row: number;
  col: number;
  direction: "across" | "down";
  length: number;
  answer: string;
  clue: string;
}

/**
 * A 5×5 mini crossword puzzle.
 * All rows and columns are valid words (word square constraint).
 * Clues are written by Claude themed to the article category.
 */
export interface CrosswordPuzzle {
  grid: string[][];
  slots: CrosswordSlot[];
  category: string;
  difficulty: "medium";
  uniquenessSignature?: string;
}

// ─── Connections ──────────────────────────────────────────────────────────────

export type ConnectionsTier = 1 | 2 | 3 | 4; // 1=yellow, 2=green, 3=blue, 4=purple

export interface ConnectionsGroup {
  label: string;
  words: string[];              // exactly 4 words, ALL CAPS
  tier: ConnectionsTier;
  explanation: string;
}

export interface ConnectionsPuzzle {
  groups: ConnectionsGroup[];   // exactly 4 groups
  category: string;
  difficulty: "medium";
  redHerrings: { word: string; couldAlsoBelong: string }[];
  /** Content-hash id to avoid repeating the same puzzle for users. */
  puzzleId?: string;
  /** Alias used by generic feed/game uniqueness memory. */
  uniquenessSignature?: string;
}

// ─── Wiki Rabbit Hole ─────────────────────────────────────────────────────────

export interface RabbitHoleLink {
  title: string;
  href: string;
  blurb: string;
  lure: string;
  depth: number;
}

export interface RabbitHolePuzzle {
  topic: string;
  mission: string;
  starterArticle: string;
  links: RabbitHoleLink[];
  difficulty: Difficulty;
  uniquenessSignature?: string;
}

// ─── Feed slot ────────────────────────────────────────────────────────────────

export type FeedSectionType = "articles" | "game";

export interface GameFeedSlot {
  sectionType: "game";
  gameType: GameType;
  index: number;
}
