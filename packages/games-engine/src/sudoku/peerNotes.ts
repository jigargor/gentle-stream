/**
 * Clear pencil-mark bit for `digit` (1–9) from peer cells when a digit is placed in (r, c),
 * whether or not the placement matches the solution — prevents notes from leaking hints (#59).
 * Clears row, column, 3×3 box, and (when applicable) main diagonals through (r, c).
 *
 * NoteMask: bitmask, bit (n-1) set ⇔ pencil mark for digit n.
 */

export function clearDigitNotesFromPeers(
  notes: number[][],
  r: number,
  c: number,
  digit: number
): void {
  if (digit < 1 || digit > 9) return;
  const bit = 1 << (digit - 1);

  for (let i = 0; i < 9; i++) {
    notes[r][i] &= ~bit;
    notes[i][c] &= ~bit;
  }

  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      notes[rr][cc] &= ~bit;
    }
  }

  if (r === c) {
    for (let i = 0; i < 9; i++) notes[i][i] &= ~bit;
  }
  if (r + c === 8) {
    for (let i = 0; i < 9; i++) notes[i][8 - i] &= ~bit;
  }
}

/**
 * Classic Sudoku / Killer: clear pencil marks for `digit` in row, column, and 3×3 box only (no diagonals).
 * Use this for standard 9×9 sudoku — not `clearDigitNotesFromPeers` (diagonal variant only).
 */
export function clearDigitNotesFromRowColBox(
  notes: number[][],
  r: number,
  c: number,
  digit: number
): void {
  if (digit < 1 || digit > 9) return;
  const bit = 1 << (digit - 1);

  for (let i = 0; i < 9; i++) {
    notes[r][i] &= ~bit;
    notes[i][c] &= ~bit;
  }

  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      notes[rr][cc] &= ~bit;
    }
  }
}
