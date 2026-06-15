import { describe, expect, it } from "vitest";

const MAX_MISTAKES = 3;

interface MistakeUndoSnapshot {
  values: number[][];
  notes: number[][];
  mistakes: number;
}

/** Mirrors SudokuCard UNDO_MISTAKE mistake restoration. */
function mistakesAfterUndo(
  currentMistakes: number,
  snap: MistakeUndoSnapshot
): { mistakes: number; failed: boolean } {
  const mistakes = snap.mistakes;
  return { mistakes, failed: mistakes >= MAX_MISTAKES };
}

describe("sudoku mistake undo", () => {
  it("restores pre-mistake tally so a third-strike undo resumes play", () => {
    const snap: MistakeUndoSnapshot = {
      values: Array.from({ length: 9 }, () => Array(9).fill(0)),
      notes: Array.from({ length: 9 }, () => Array(9).fill(0)),
      mistakes: 2,
    };

    const after = mistakesAfterUndo(3, snap);

    expect(after.mistakes).toBe(2);
    expect(after.failed).toBe(false);
  });

  it("keeps failed when undoing back to three mistakes", () => {
    const snap: MistakeUndoSnapshot = {
      values: Array.from({ length: 9 }, () => Array(9).fill(0)),
      notes: Array.from({ length: 9 }, () => Array(9).fill(0)),
      mistakes: 3,
    };

    const after = mistakesAfterUndo(3, snap);

    expect(after.mistakes).toBe(3);
    expect(after.failed).toBe(true);
  });
});
