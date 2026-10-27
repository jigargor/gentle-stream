import { describe, expect, it } from "vitest";
import {
  clearDigitNotesFromPeers,
  clearDigitNotesFromRowColBox,
} from "@/lib/games/sudokuPeerNotes";

function emptyNotes(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function noteMask(...digits: number[]): number {
  return digits.reduce((mask, d) => mask | (1 << (d - 1)), 0);
}

describe("clearDigitNotesFromPeers", () => {
  it("clears digit from row, column, box, and main diagonals through (r, c)", () => {
    const notes = emptyNotes();
    notes[4][4] = noteMask(5, 7);
    notes[4][0] = noteMask(5);
    notes[0][4] = noteMask(5);
    notes[3][3] = noteMask(5);
    notes[0][0] = noteMask(5);
    notes[0][8] = noteMask(5);

    clearDigitNotesFromPeers(notes, 4, 4, 5);

    expect(notes[4][4]).toBe(noteMask(7));
    expect(notes[4][0]).toBe(0);
    expect(notes[0][4]).toBe(0);
    expect(notes[3][3]).toBe(0);
    expect(notes[0][0]).toBe(0);
    expect(notes[0][8]).toBe(0);
  });
});

describe("clearDigitNotesFromRowColBox", () => {
  it("clears digit from row, column, and box only", () => {
    const notes = emptyNotes();
    notes[4][5] = noteMask(2);
    notes[4][0] = noteMask(2);
    notes[0][0] = noteMask(2);

    clearDigitNotesFromRowColBox(notes, 4, 4, 2);

    expect(notes[4][5]).toBe(0);
    expect(notes[4][0]).toBe(0);
    expect(notes[0][0]).toBe(noteMask(2));
  });

  it("preserves diagonal notes outside row, column, and box (classic sudoku)", () => {
    const notes = emptyNotes();
    notes[4][4] = noteMask(5, 7);
    notes[4][0] = noteMask(5);
    notes[0][4] = noteMask(5);
    notes[3][3] = noteMask(5);
    notes[0][0] = noteMask(5);
    notes[0][8] = noteMask(5);

    clearDigitNotesFromRowColBox(notes, 4, 4, 5);

    expect(notes[4][4]).toBe(noteMask(7));
    expect(notes[4][0]).toBe(0);
    expect(notes[0][4]).toBe(0);
    expect(notes[3][3]).toBe(0);
    expect(notes[0][0]).toBe(noteMask(5));
    expect(notes[0][8]).toBe(noteMask(5));
  });

  it("runs on incorrect placements so notes do not leak solution hints (#59)", () => {
    const notes = emptyNotes();
    notes[0][1] = noteMask(3);
    notes[1][0] = noteMask(3);

    clearDigitNotesFromRowColBox(notes, 0, 0, 3);

    expect(notes[0][1]).toBe(0);
    expect(notes[1][0]).toBe(0);
  });
});
