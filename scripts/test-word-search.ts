/**
 * Test: Word Search Generator
 *
 * Verifies grid dimensions, all words are findable, no word overflows
 * the grid, and the theme word bank is used when a category is provided.
 *
 * Zero API calls. Zero DB connections. Pure in-process logic.
 *
 * Run from project root:
 *   npx tsx scripts/test-word-search.ts
 */

import { generateWordSearch } from "../lib/games/wordSearchGenerator";
import type { Difficulty, PlacedWord } from "../lib/games/types";
import { WORD_BANKS } from "../lib/games/wordSearchStaticBanks";

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

const DIRECTION_DELTAS: Record<string, [number, number]> = {
  E:  [0,  1], W:  [0, -1],
  N:  [-1, 0], S:  [1,  0],
  NE: [-1, 1], NW: [-1,-1],
  SE: [1,  1], SW: [1, -1],
};

function extractWord(grid: string[][], placed: PlacedWord): string {
  const [dr, dc] = DIRECTION_DELTAS[placed.direction];
  return Array.from({ length: placed.word.length }, (_, i) =>
    grid[placed.row + dr * i]?.[placed.col + dc * i] ?? "?"
  ).join("");
}

function wordInBounds(placed: PlacedWord, rows: number, cols: number): boolean {
  const [dr, dc] = DIRECTION_DELTAS[placed.direction];
  const lastR = placed.row + dr * (placed.word.length - 1);
  const lastC = placed.col + dc * (placed.word.length - 1);
  return (
    placed.row >= 0 && placed.row < rows &&
    placed.col >= 0 && placed.col < cols &&
    lastR >= 0 && lastR < rows &&
    lastC >= 0 && lastC < cols
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const GRID_SIZES: Record<Difficulty, [number, number]> = {
  easy:   [10, 10],
  medium: [13, 13],
  hard:   [15, 15],
};

const WORD_COUNTS: Record<Difficulty, [number, number]> = {
  easy:   [1, 6],
  medium: [1, 8],
  hard:   [1, 10],
};

function testDifficulty(difficulty: Difficulty) {
  console.log(`\n── ${difficulty} ────────────────────────────────────────────────`);

  const puzzle = generateWordSearch(difficulty);
  const [rows, cols] = GRID_SIZES[difficulty];
  const [minW, maxW] = WORD_COUNTS[difficulty];

  assert(puzzle.rows === rows, `Grid has ${rows} rows (got ${puzzle.rows})`);
  assert(puzzle.cols === cols, `Grid has ${cols} cols (got ${puzzle.cols})`);
  assert(
    puzzle.grid.length === rows &&
    puzzle.grid.every((r) => r.length === cols),
    "Grid array matches declared dimensions"
  );
  assert(
    puzzle.words.length >= minW && puzzle.words.length <= maxW,
    `Word count ${puzzle.words.length} is within [${minW}, ${maxW}]`
  );

  // Every cell must be a single uppercase letter
  const allLetters = puzzle.grid.every((row) =>
    row.every((cell) => /^[A-Z]$/.test(cell))
  );
  assert(allLetters, "All cells contain a single uppercase letter");

  // Every placed word must be within bounds
  const allInBounds = puzzle.words.every((w) => wordInBounds(w, rows, cols));
  assert(allInBounds, "All words are within grid bounds");

  // Every placed word must be readable in the grid at its stated position
  let allReadable = true;
  for (const w of puzzle.words) {
    const extracted = extractWord(puzzle.grid, w);
    if (extracted !== w.word) {
      allReadable = false;
      assert(false, `Word "${w.word}" readable at its position`, `got "${extracted}"`);
      break;
    }
  }
  if (allReadable) assert(true, "All words are readable at their stated positions");

  assert(puzzle.difficulty === difficulty, `Difficulty field is "${difficulty}"`);
}

function testCategoryTheme() {
  console.log("\n── Category theming ────────────────────────────────────────────");

  const puzzle = generateWordSearch("medium", "Science & Discovery");
  const scienceWords = new Set(
    (WORD_BANKS["Science & Discovery"] ?? []).map((w) => w.toUpperCase())
  );
  const placedWords = puzzle.words.map((w) => w.word);
  const allFromBank = placedWords.every((w) => scienceWords.has(w));
  assert(allFromBank, "All placed words come from the Science & Discovery bank");
  assert(puzzle.theme === "Science & Discovery", "Theme label matches category");
}

function testConsistency() {
  console.log("\n── Consistency ─────────────────────────────────────────────────");

  const a = generateWordSearch("medium");
  const b = generateWordSearch("medium");
  const sameGrid = a.grid.every((row, r) => row.every((cell, c) => cell === b.grid[r][c]));
  assert(!sameGrid, "Two medium puzzles have different grids");
}

function testEasyDirections() {
  console.log("\n── Easy: no diagonal words ─────────────────────────────────────");

  // Run a few times to reduce flakiness
  let allOrthogonal = true;
  for (let i = 0; i < 5; i++) {
    const p = generateWordSearch("easy");
    if (p.words.some((w) => ["NE", "NW", "SE", "SW"].includes(w.direction))) {
      allOrthogonal = false;
      break;
    }
  }
  assert(allOrthogonal, "Easy puzzles never place words diagonally");
}

function testSpeed() {
  console.log("\n── Performance ─────────────────────────────────────────────────");

  const runs = 5;
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = Date.now();
    generateWordSearch("hard");
    times.push(Date.now() - t);
  }
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / runs);
  const max = Math.max(...times);
  assert(avg < 50, `Average generation time ${avg}ms < 50ms`);
  assert(max < 200, `Worst-case generation time ${max}ms < 200ms`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("══════════════════════════════════════════════");
console.log("  Word Search Generator Tests");
console.log("══════════════════════════════════════════════");

testDifficulty("easy");
testDifficulty("medium");
testDifficulty("hard");
testCategoryTheme();
testConsistency();
testEasyDirections();
testSpeed();

console.log("\n══════════════════════════════════════════════");
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log("══════════════════════════════════════════════\n");

process.exit(failed > 0 ? 1 : 0);
