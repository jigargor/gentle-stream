/**
 * Test: Killer Sudoku + Nonogram generators
 * Zero API calls. Zero DB. Pure in-process logic.
 *
 * Run from project root:
 *   npx tsx scripts/test-killer-nonogram.ts
 */

import { generateKillerSudoku } from "../lib/games/killerSudokuGenerator";
import { generateNonogram } from "../lib/games/nonogramGenerator";
import type { Difficulty, Cage } from "../lib/games/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) { console.log(`  ✓  ${label}`); passed++; }
  else { console.error(`  ✗  ${label}`); if (detail) console.error(`     ${detail}`); failed++; }
}

// ─── Killer Sudoku ────────────────────────────────────────────────────────────

function isValidSudokuSolution(grid: number[][]): boolean {
  const isValidGroup = (nums: number[]) => {
    const seen = new Set(nums);
    return seen.size === 9 && !seen.has(0) && Math.min(...nums) === 1 && Math.max(...nums) === 9;
  };
  for (let r = 0; r < 9; r++) if (!isValidGroup(grid[r])) return false;
  for (let c = 0; c < 9; c++) if (!isValidGroup(grid.map(r => r[c]))) return false;
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const box: number[] = [];
      for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) box.push(grid[r][c]);
      if (!isValidGroup(box)) return false;
    }
  return true;
}

function testKillerSudoku(difficulty: Difficulty) {
  console.log(`\n── Killer Sudoku: ${difficulty} ──────────────────────────────────`);
  const puzzle = generateKillerSudoku(difficulty);

  assert(isValidSudokuSolution(puzzle.solution), "Solution is a valid 9x9 Sudoku");

  // All 81 cells assigned to exactly one cage
  const cellSet = new Set<string>();
  for (const cage of puzzle.cages) {
    for (const [r, c] of cage.cells) {
      const key = `${r},${c}`;
      assert(!cellSet.has(key), `Cell [${r},${c}] not in multiple cages`);
      cellSet.add(key);
    }
  }
  assert(cellSet.size === 81, `All 81 cells assigned (got ${cellSet.size})`);

  // Each cage sum matches the solution
  let allSumsCorrect = true;
  for (const cage of puzzle.cages) {
    const actualSum = cage.cells.reduce((s, [r, c]) => s + puzzle.solution[r][c], 0);
    if (actualSum !== cage.sum) { allSumsCorrect = false; break; }
  }
  assert(allSumsCorrect, "All cage sums match the solution");

  // No single-cell cages (they trivially give away the answer)
  const hasNoSingletons = puzzle.cages.every(c => c.cells.length >= 2);
  assert(hasNoSingletons, "No single-cell cages");

  assert(puzzle.difficulty === difficulty, `Difficulty field is "${difficulty}"`);
}

// ─── Nonogram ─────────────────────────────────────────────────────────────────

function computeClues(line: boolean[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const v of line) { if (v) run++; else if (run > 0) { clues.push(run); run = 0; } }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
}

function testNonogram(difficulty: Difficulty) {
  console.log(`\n── Nonogram: ${difficulty} ──────────────────────────────────────`);
  const sizes: Record<Difficulty, [number,number]> = { easy:[5,5], medium:[10,10], hard:[15,15] };
  const [rows, cols] = sizes[difficulty];
  const puzzle = generateNonogram(difficulty);

  assert(puzzle.rows === rows && puzzle.cols === cols, `Grid is ${rows}×${cols}`);
  assert(puzzle.solution.length === rows && puzzle.solution.every(r => r.length === cols), "Solution array dimensions match");
  assert(puzzle.rowClues.length === rows, `${rows} row clues`);
  assert(puzzle.colClues.length === cols, `${cols} column clues`);

  // Row clues must match the solution
  let rowCluesMatch = true;
  for (let r = 0; r < rows; r++) {
    const expected = computeClues(puzzle.solution[r]);
    const actual = puzzle.rowClues[r];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) { rowCluesMatch = false; break; }
  }
  assert(rowCluesMatch, "Row clues match the solution");

  // Column clues must match the solution
  let colCluesMatch = true;
  for (let c = 0; c < cols; c++) {
    const col = puzzle.solution.map(row => row[c]);
    const expected = computeClues(col);
    const actual = puzzle.colClues[c];
    if (JSON.stringify(expected) !== JSON.stringify(actual)) { colCluesMatch = false; break; }
  }
  assert(colCluesMatch, "Column clues match the solution");

  assert(puzzle.difficulty === difficulty, `Difficulty field is "${difficulty}"`);
}

// ─── Performance ──────────────────────────────────────────────────────────────

function testSpeed() {
  console.log("\n── Performance ──────────────────────────────────────────────────");
  const runs = 3;

  for (const diff of ["easy", "medium", "hard"] as Difficulty[]) {
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t = Date.now(); generateKillerSudoku(diff); times.push(Date.now() - t);
    }
    const avg = Math.round(times.reduce((a,b) => a+b, 0) / runs);
    assert(avg < 500, `Killer Sudoku ${diff}: avg ${avg}ms < 500ms`);
  }

  for (const diff of ["easy", "medium", "hard"] as Difficulty[]) {
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t = Date.now(); generateNonogram(diff); times.push(Date.now() - t);
    }
    const avg = Math.round(times.reduce((a,b) => a+b, 0) / runs);
    assert(avg < 50, `Nonogram ${diff}: avg ${avg}ms < 50ms`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("══════════════════════════════════════════════");
console.log("  Killer Sudoku + Nonogram Tests");
console.log("══════════════════════════════════════════════");

testKillerSudoku("easy");
testKillerSudoku("medium");
testKillerSudoku("hard");
testNonogram("easy");
testNonogram("medium");
testNonogram("hard");
testSpeed();

console.log("\n══════════════════════════════════════════════");
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log("══════════════════════════════════════════════\n");
process.exit(failed > 0 ? 1 : 0);
