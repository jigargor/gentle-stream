/**
 * Killer Sudoku Generator
 *
 * Killer Sudoku rules:
 *   - Standard 9×9 Sudoku constraints apply (no repeats in row, col, box)
 *   - No digits are given at the start — the only clues are "cages"
 *   - Each cage is a group of adjacent cells with a target sum
 *   - No digit may repeat within a cage
 *
 * Algorithm:
 *   1. Generate a valid solved Sudoku grid (reuses the backtracking solver)
 *   2. Partition all 81 cells into non-overlapping cages via flood fill
 *      - Cage sizes: 2–5 cells (easy), 2–4 (medium/hard) for solvability
 *      - Smaller cages = more constrained = easier
 *   3. Record each cage's cells and their sum from the solution
 *
 * Difficulty:
 *   easy:   avg cage size ~3 (more small cages, more sum constraints)
 *   medium: avg cage size ~4
 *   hard:   avg cage size ~5 (fewer, bigger cages — harder to deduce)
 */

import type { KillerSudokuPuzzle, Cage, Difficulty } from "./types";

// ─── Configuration ────────────────────────────────────────────────────────────

interface CageConfig {
  minSize: number;
  maxSize: number;
}

const CAGE_CONFIG: Record<Difficulty, CageConfig> = {
  easy:   { minSize: 2, maxSize: 3 },
  medium: { minSize: 2, maxSize: 4 },
  hard:   { minSize: 2, maxSize: 5 },
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateKillerSudoku(difficulty: Difficulty = "medium"): KillerSudokuPuzzle {
  const solution = createSolvedGrid();
  const cages = createCages(solution, CAGE_CONFIG[difficulty]);

  return { solution, cages, difficulty };
}

// ─── Sudoku solver (identical to standard generator) ──────────────────────────

function emptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function copyGrid(g: number[][]): number[][] {
  return g.map((r) => [...r]);
}

function createSolvedGrid(): number[][] {
  const grid = emptyGrid();
  for (let box = 0; box < 9; box += 3) fillBox(grid, box, box);
  solve(grid);
  return grid;
}

function fillBox(grid: number[][], row: number, col: number): void {
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let i = 0;
  for (let r = row; r < row + 3; r++)
    for (let c = col; c < col + 3; c++)
      grid[r][c] = nums[i++];
}

function solve(grid: number[][]): boolean {
  const cell = findEmpty(grid);
  if (!cell) return true;
  const [row, col] = cell;
  for (const num of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (isValid(grid, row, col, num)) {
      grid[row][col] = num;
      if (solve(grid)) return true;
      grid[row][col] = 0;
    }
  }
  return false;
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  if (grid[row].includes(num)) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (grid[r][c] === num) return false;
  return true;
}

function findEmpty(grid: number[][]): [number, number] | null {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] === 0) return [r, c];
  return null;
}

// ─── Cage creation ────────────────────────────────────────────────────────────

/**
 * Partition all 81 cells into cages using a greedy flood fill.
 * We visit cells in random order and grow cages from seed cells.
 */
function createCages(solution: number[][], config: CageConfig): Cage[] {
  const assigned = Array.from({ length: 9 }, () => Array(9).fill(-1));
  const cages: Cage[] = [];
  const order = shuffle(allPositions());

  for (const [seedR, seedC] of order) {
    if (assigned[seedR][seedC] !== -1) continue;

    // Flood fill a new cage from this seed
    const cageId = cages.length;
    const cells: [number, number][] = [[seedR, seedC]];
    assigned[seedR][seedC] = cageId;

    const targetSize = randInt(config.minSize, config.maxSize);
    const frontier: [number, number][] = getUnassignedNeighbors(seedR, seedC, assigned);

    while (cells.length < targetSize && frontier.length > 0) {
      // Pick a random frontier cell
      const idx = Math.floor(Math.random() * frontier.length);
      const [nr, nc] = frontier.splice(idx, 1)[0];

      if (assigned[nr][nc] !== -1) continue;
      assigned[nr][nc] = cageId;
      cells.push([nr, nc]);

      // Expand frontier
      for (const nb of getUnassignedNeighbors(nr, nc, assigned)) {
        frontier.push(nb);
      }
    }

    const sum = cells.reduce((s, [r, c]) => s + solution[r][c], 0);
    cages.push({ id: cageId, cells, sum });
  }

  return eliminateSingletons(cages, solution);
}

function getUnassignedNeighbors(
  row: number,
  col: number,
  assigned: number[][]
): [number, number][] {
  const neighbors: [number, number][] = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < 9 && c >= 0 && c < 9 && assigned[r][c] === -1) {
      neighbors.push([r, c]);
    }
  }
  return neighbors;
}

function allPositions(): [number, number][] {
  const pos: [number, number][] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      pos.push([r, c]);
  return pos;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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

/**
 * Post-process: merge any singleton cage (size 1) into an adjacent cage.
 * Called after createCages to guarantee no single-cell cages exist.
 */
function eliminateSingletons(cages: Cage[], solution: number[][]): Cage[] {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < cages.length; i++) {
      if (cages[i].cells.length !== 1) continue;
      const [r, c] = cages[i].cells[0];
      // Find an adjacent cage to absorb this singleton
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;
        const neighborIdx = cages.findIndex(
          (cage, idx) => idx !== i && cage.cells.some(([cr, cc]) => cr === nr && cc === nc)
        );
        if (neighborIdx === -1) continue;
        // Merge singleton into neighbor
        cages[neighborIdx].cells.push([r, c]);
        cages[neighborIdx].sum += solution[r][c];
        cages.splice(i, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return cages;
}
