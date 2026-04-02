export interface SudokuEngineState {
  startedAt: number | null;
  elapsedSecs: number;
  mistakes: number;
}

export interface SudokuTickInput {
  nowMs: number;
}

/**
 * Minimal shared reducer helper used as an extraction starter.
 * Full Sudoku reducer migration happens in a subsequent slice.
 */
export function tickSudokuElapsed(
  state: SudokuEngineState,
  input: SudokuTickInput
): SudokuEngineState {
  if (!state.startedAt) return state;
  return {
    ...state,
    elapsedSecs: Math.max(0, Math.floor((input.nowMs - state.startedAt) / 1000)),
  };
}
