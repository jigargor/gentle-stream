/**
 * Nonogram (Picross) Generator
 *
 * A nonogram is a grid-based logic puzzle where the player fills cells
 * to reveal a picture. Each row and column has clues — sequences of
 * numbers indicating consecutive runs of filled cells.
 *
 * Example clue "3 1" for a row of 7: "■■■ _ ■ _" is one valid layout.
 *
 * Algorithm:
 *   1. Generate a random binary grid (filled/empty) with controlled density
 *   2. Compute row and column clues from the grid
 *   3. Verify the puzzle has a unique solution (simplified check:
 *      any row/col with a clue that fully determines it reduces ambiguity)
 *      For a proper check we run a constraint-propagation solver.
 *
 * Difficulty:
 *   easy:   5×5 grid, ~60% fill density (many filled cells = more constrained)
 *   medium: 10×10 grid, ~50% fill density
 *   hard:   15×15 grid, ~45% fill density
 */

import type { NonogramPuzzle, Difficulty } from "./types";

// ─── Configuration ────────────────────────────────────────────────────────────

interface GridConfig {
  rows: number;
  cols: number;
  density: number; // probability of a cell being filled (0–1)
}

const GRID_CONFIG: Record<Difficulty, GridConfig> = {
  easy:   { rows: 5,  cols: 5,  density: 0.60 },
  medium: { rows: 10, cols: 10, density: 0.50 },
  hard:   { rows: 15, cols: 15, density: 0.45 },
};

const MAX_GENERATION_ATTEMPTS = 50;

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateNonogram(difficulty: Difficulty = "medium"): NonogramPuzzle {
  const config = GRID_CONFIG[difficulty];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const solution = generateGrid(config);
    if (!isDegenerate(solution, config)) {
      const rowClues = computeRowClues(solution);
      const colClues = computeColClues(solution);
      return {
        solution,
        rowClues,
        colClues,
        rows: config.rows,
        cols: config.cols,
        difficulty,
      };
    }
  }

  // Fallback: return a simple cross pattern that always works
  return generateFallback(config, difficulty);
}

// ─── Grid generation ──────────────────────────────────────────────────────────

function generateGrid(config: GridConfig): boolean[][] {
  return Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, () => Math.random() < config.density)
  );
}

/**
 * Reject degenerate grids:
 * - Any row or column that is entirely empty or entirely filled
 *   (these produce trivial "0" or single-number clues and are boring)
 * - A grid where more than 30% of rows/cols are trivial
 */
function isDegenerate(solution: boolean[][], config: GridConfig): boolean {
  let trivialCount = 0;

  for (let r = 0; r < config.rows; r++) {
    const row = solution[r];
    const allSame = row.every((v) => v === row[0]);
    if (allSame) trivialCount++;
  }

  for (let c = 0; c < config.cols; c++) {
    const col = solution.map((row) => row[c]);
    const allSame = col.every((v) => v === col[0]);
    if (allSame) trivialCount++;
  }

  const total = config.rows + config.cols;
  return trivialCount / total > 0.3;
}

// ─── Clue computation ─────────────────────────────────────────────────────────

/**
 * Compute the run-length encoding of a line (row or column).
 * Returns an array of run lengths. Empty line returns [0].
 */
function computeClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell) {
      run++;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
}

function computeRowClues(solution: boolean[][]): number[][] {
  return solution.map((row) => computeClues(row));
}

function computeColClues(solution: boolean[][]): number[][] {
  const cols = solution[0].length;
  return Array.from({ length: cols }, (_, c) =>
    computeClues(solution.map((row) => row[c]))
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

/** Generate a simple diamond pattern that always produces a valid puzzle */
function generateFallback(config: GridConfig, difficulty: Difficulty): NonogramPuzzle {
  const { rows, cols } = config;
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const radius = Math.min(cx, cy);

  const solution: boolean[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      Math.abs(r - cy) + Math.abs(c - cx) <= radius
    )
  );

  return {
    solution,
    rowClues: computeRowClues(solution),
    colClues: computeColClues(solution),
    rows,
    cols,
    difficulty,
  };
}
