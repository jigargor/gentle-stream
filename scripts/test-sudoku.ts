/**
 * Test: Sudoku generator
 *
 * Verifies puzzle validity, uniqueness, and difficulty calibration.
 * Zero API calls. Zero DB connections. Pure in-process logic.
 *
 * Run from project root:
 *   npx tsx scripts/test-sudoku.ts
 */

import { generateSudoku } from "../lib/games/sudokuGenerator";
import type { Difficulty } from "../lib/games/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     ${detail}`);
    failed++;
  }
}

// ─── Validators ───────────────────────────────────────────────────────────────

function isValidGroup(nums: number[]): boolean {
  const seen = new Set<number>();
  for (const n of nums) {
    if (n < 1 || n > 9) return false;
    if (seen.has(n)) return false;
    seen.add(n);
  }
  return seen.size === 9;
}

function isValidSolution(grid: number[][]): boolean {
  // All rows
  for (let r = 0; r < 9; r++) {
    if (!isValidGroup(grid[r])) return false;
  }
  // All columns
  for (let c = 0; c < 9; c++) {
    if (!isValidGroup(grid.map((row) => row[c]))) return false;
  }
  // All 3×3 boxes
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const box: number[] = [];
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) {
          box.push(grid[r][c]);
        }
      }
      if (!isValidGroup(box)) return false;
    }
  }
  return true;
}

function givenCellsConsistentWithSolution(
  given: number[][],
  solution: number[][]
): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (given[r][c] !== 0 && given[r][c] !== solution[r][c]) return false;
    }
  }
  return true;
}

// Simple uniqueness check: try to find a second solution via brute force
function hasUniqueSolution(given: number[][]): boolean {
  const grid = given.map((row) => [...row]);
  let count = 0;

  function solve(): boolean {
    const cell = findEmpty(grid);
    if (!cell) { count++; return count >= 2; }
    const [r, c] = cell;
    for (let num = 1; num <= 9; num++) {
      if (isPlaceable(grid, r, c, num)) {
        grid[r][c] = num;
        if (solve()) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  solve();
  return count === 1;
}

function findEmpty(grid: number[][]): [number, number] | null {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) return [r, c];
    }
  }
  return null;
}

function isPlaceable(grid: number[][], row: number, col: number, num: number): boolean {
  if (grid[row].includes(num)) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === num) return false;
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (grid[r][c] === num) return false;
  return true;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const GIVENS_RANGE: Record<Difficulty, [number, number]> = {
  easy:   [36, 40],
  medium: [28, 35],
  hard:   [22, 27],
};

function testDifficulty(difficulty: Difficulty) {
  console.log(`\n── ${difficulty} ────────────────────────────────────────────────`);

  const puzzle = generateSudoku(difficulty);
  const [min, max] = GIVENS_RANGE[difficulty];

  assert(
    puzzle.solution.length === 9 && puzzle.solution.every((r) => r.length === 9),
    "Solution is 9×9"
  );
  assert(
    puzzle.given.length === 9 && puzzle.given.every((r) => r.length === 9),
    "Given grid is 9×9"
  );
  assert(
    isValidSolution(puzzle.solution),
    "Solution satisfies all Sudoku constraints"
  );
  assert(
    givenCellsConsistentWithSolution(puzzle.given, puzzle.solution),
    "All given cells match the solution"
  );
  assert(
    puzzle.givensCount >= min && puzzle.givensCount <= max,
    `Given count ${puzzle.givensCount} is within [${min}, ${max}]`
  );
  assert(
    puzzle.difficulty === difficulty,
    `Difficulty field is "${difficulty}"`
  );

  // Uniqueness check (the most expensive assertion — run last)
  const start = Date.now();
  assert(
    hasUniqueSolution(puzzle.given),
    "Puzzle has exactly one solution",
    `(took ${Date.now() - start}ms)`
  );
}

function testConsistency() {
  console.log("\n── Consistency: two puzzles are different ──────────────────────");
  const a = generateSudoku("medium");
  const b = generateSudoku("medium");
  const same = a.given.every((row, r) => row.every((val, c) => val === b.given[r][c]));
  assert(!same, "Two medium puzzles are not identical");
}

function testSpeed() {
  console.log("\n── Performance (medium puzzles) ─────────────────────────────────");
  const runs = 5;
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    generateSudoku("medium");
    times.push(Date.now() - t);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / runs);
  const max = Math.max(...times);
  assert(avg < 800, `Average generation time ${avg}ms < 800ms`);
  assert(max < 2500, `Worst-case generation time ${max}ms < 2500ms`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("══════════════════════════════════════════════");
console.log("  Sudoku Generator Tests");
console.log("══════════════════════════════════════════════");

testDifficulty("easy");
testDifficulty("medium");
testDifficulty("hard");
testConsistency();
testSpeed();

console.log("\n══════════════════════════════════════════════");
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);
