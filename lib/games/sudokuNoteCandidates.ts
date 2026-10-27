/** True if `digit` is already placed in the same row, column, or 3×3 box (excluding r,c). */
export function digitAppearsInSudokuPeers(
  values: number[][],
  r: number,
  c: number,
  digit: number
): boolean {
  for (let i = 0; i < 9; i++) {
    if (i !== c && values[r][i] === digit) return true;
    if (i !== r && values[i][c] === digit) return true;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      if ((rr !== r || cc !== c) && values[rr][cc] === digit) return true;
    }
  }
  return false;
}

/** Block adding a new note for `num`; removing an existing note is always allowed. */
export function isSudokuNoteAddBlocked(
  values: number[][],
  notes: number[][],
  r: number,
  c: number,
  num: number
): boolean {
  if (values[r][c] !== 0) return false;
  const bit = 1 << (num - 1);
  if ((notes[r][c] & bit) !== 0) return false;
  return digitAppearsInSudokuPeers(values, r, c, num);
}
