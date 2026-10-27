import { describe, expect, it } from "vitest";
import {
  digitAppearsInSudokuPeers,
  isSudokuNoteAddBlocked,
} from "@/lib/games/sudokuNoteCandidates";

function emptyGrid(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function emptyNotes(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function noteMask(...digits: number[]): number {
  return digits.reduce((mask, d) => mask | (1 << (d - 1)), 0);
}

describe("digitAppearsInSudokuPeers", () => {
  it("detects digit in same row", () => {
    const values = emptyGrid();
    values[2][5] = 4;
    expect(digitAppearsInSudokuPeers(values, 2, 0, 4)).toBe(true);
  });

  it("detects digit in same column", () => {
    const values = emptyGrid();
    values[5][3] = 7;
    expect(digitAppearsInSudokuPeers(values, 0, 3, 7)).toBe(true);
  });

  it("detects digit in same 3×3 box", () => {
    const values = emptyGrid();
    values[4][5] = 2;
    expect(digitAppearsInSudokuPeers(values, 3, 3, 2)).toBe(true);
  });

  it("ignores the selected cell itself", () => {
    const values = emptyGrid();
    values[2][2] = 6;
    expect(digitAppearsInSudokuPeers(values, 2, 2, 6)).toBe(false);
  });
});

describe("isSudokuNoteAddBlocked", () => {
  it("blocks adding a note when digit appears in peers", () => {
    const values = emptyGrid();
    const notes = emptyNotes();
    values[0][1] = 5;
    expect(isSudokuNoteAddBlocked(values, notes, 0, 0, 5)).toBe(true);
  });

  it("allows adding a note when digit is not in peers", () => {
    const values = emptyGrid();
    const notes = emptyNotes();
    expect(isSudokuNoteAddBlocked(values, notes, 0, 0, 5)).toBe(false);
  });

  it("allows removing an existing note even when digit is in peers", () => {
    const values = emptyGrid();
    const notes = emptyNotes();
    values[0][1] = 5;
    notes[0][0] = noteMask(5);
    expect(isSudokuNoteAddBlocked(values, notes, 0, 0, 5)).toBe(false);
  });

  it("does not block when cell already has a value", () => {
    const values = emptyGrid();
    const notes = emptyNotes();
    values[0][0] = 3;
    expect(isSudokuNoteAddBlocked(values, notes, 0, 0, 5)).toBe(false);
  });
});
