"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { KillerSudokuPuzzle, Cage, Difficulty } from "@/lib/games/types";
import {
  GAME_HOW_TO_URL,
  GameHowToPlayLink,
} from "@/components/games/GameHowToPlayLink";
import {
  cellInFlashUnits,
  completedSudokuUnits,
} from "@/lib/games/sudokuLineComplete";
import { useGridSelectionColor } from "@/lib/games/useGridSelectionColor";
import { clearDigitNotesFromRowColBox } from "@/lib/games/sudokuPeerNotes";

const MAX_MISTAKES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Bitmask: bit (n-1) set ⇔ pencil mark for digit n (1–9). */
type NoteMask = number;

interface KillerMistakeUndoSnapshot {
  values: number[][];
  notes: NoteMask[][];
  /** Mistake count before the wrong move that pushed this snapshot (undo keeps the live tally). */
  mistakes: number;
}

interface BoardState {
  values: number[][];
  notes: NoteMask[][];
  selected: [number, number] | null;
  errors: boolean[][];
  completed: boolean;
  failed: boolean;
  mistakes: number;
  mistakeUndoStack: KillerMistakeUndoSnapshot[];
  startedAt: number | null;
  elapsedSecs: number;
}

type Action =
  | { type: "SELECT"; row: number; col: number }
  | { type: "INPUT"; num: number; asNote?: boolean }
  | { type: "UNDO_MISTAKE" }
  | { type: "ERASE" }
  | { type: "TICK" }
  | { type: "RESET" };

interface KillerSudokuCardProps {
  puzzle: KillerSudokuPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
  puzzleSignature?: string;
}

// ─── Cell → cage lookup ───────────────────────────────────────────────────────

function buildCageMap(cages: Cage[]): Map<string, Cage> {
  const map = new Map<string, Cage>();
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      map.set(`${r},${c}`, cage);
    }
  }
  return map;
}

/**
 * Return the top-left cell of each cage (for sum label placement).
 * Top-left = minimum row then minimum col.
 */
function cageTopLeft(cage: Cage): [number, number] {
  return cage.cells.reduce(([br, bc], [r, c]) =>
    r < br || (r === br && c < bc) ? [r, c] : [br, bc]
  , cage.cells[0]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeErrors(values: number[][], cages: Cage[]): boolean[][] {
  const errors: boolean[][] = Array.from({ length: 9 }, () => Array(9).fill(false));

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = values[r][c];
      if (v === 0) continue;

      // Row conflict
      for (let cc = 0; cc < 9; cc++) {
        if (cc !== c && values[r][cc] === v) { errors[r][c] = true; break; }
      }
      if (errors[r][c]) continue;
      // Col conflict
      for (let rr = 0; rr < 9; rr++) {
        if (rr !== r && values[rr][c] === v) { errors[r][c] = true; break; }
      }
      if (errors[r][c]) continue;
      // Box conflict
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      outer: for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
          if ((rr !== r || cc !== c) && values[rr][cc] === v) {
            errors[r][c] = true; break outer;
          }
        }
      }
      if (errors[r][c]) continue;
      // Cage duplicate
    }
  }

  // Also mark cage sum violations
  for (const cage of cages) {
    const cageVals = cage.cells.map(([r, c]) => values[r][c]);
    const allFilled = cageVals.every((v) => v !== 0);
    if (!allFilled) continue;
    const sum = cageVals.reduce((a, b) => a + b, 0);
    const hasDupe = new Set(cageVals).size !== cageVals.length;
    if (sum !== cage.sum || hasDupe) {
      for (const [r, c] of cage.cells) errors[r][c] = true;
    }
  }

  return errors;
}

function isComplete(values: number[][], solution: number[][]): boolean {
  return values.every((row, r) => row.every((v, c) => v === solution[r][c]));
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stableKillerPuzzleKey(p: KillerSudokuPuzzle): string {
  return p.solution.map((row) => row.join("")).join("");
}

function cloneValues(values: number[][]): number[][] {
  return values.map((row) => [...row]);
}

function emptyNotesGrid(): NoteMask[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function cloneNotes(notes: NoteMask[][]): NoteMask[][] {
  return notes.map((row) => [...row]);
}

/** True if `digit` is already placed in the same row, column, or 3×3 box (excluding r,c). */
function digitAppearsInSudokuPeers(
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

function digitAppearsAsValueInCage(
  values: number[][],
  cageMap: Map<string, Cage>,
  r: number,
  c: number,
  digit: number
): boolean {
  const cage = cageMap.get(`${r},${c}`);
  if (!cage) return false;
  for (const [rr, cc] of cage.cells) {
    if (rr === r && cc === c) continue;
    if (values[rr][cc] === digit) return true;
  }
  return false;
}

/** Block adding a new note for `num`; removing an existing note is always allowed. */
function isKillerNoteAddBlocked(
  values: number[][],
  notes: NoteMask[][],
  cageMap: Map<string, Cage>,
  r: number,
  c: number,
  num: number
): boolean {
  if (values[r][c] !== 0) return false;
  const bit = 1 << (num - 1);
  if ((notes[r][c] & bit) !== 0) return false;
  if (digitAppearsInSudokuPeers(values, r, c, num)) return true;
  if (digitAppearsAsValueInCage(values, cageMap, r, c, num)) return true;
  return false;
}

function clearDigitNotesFromCagePeers(
  notes: NoteMask[][],
  cage: Cage,
  digit: number,
  placementR: number,
  placementC: number
): void {
  if (digit < 1 || digit > 9) return;
  const bit = 1 << (digit - 1);
  for (const [rr, cc] of cage.cells) {
    if (rr === placementR && cc === placementC) continue;
    notes[rr][cc] &= ~bit;
  }
}

/** Inset from cell edge (px) so dashed cage lines read clearly inside the solid grid. */
const CAGE_LINE_INSET = 3;

function KillerCellNotes({
  mask,
  hasCageSumLabel,
}: {
  mask: NoteMask;
  /** Top-left of cage shows sum — keep pencil marks out of that corner. */
  hasCageSumLabel: boolean;
}) {
  if (mask === 0) return null;
  const noteStyle: React.CSSProperties = {
    fontSize: "clamp(4px, 1.5vw, 7px)",
    fontWeight: 500,
    color: "#6b6560",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Playfair Display', Georgia, serif",
  };
  // Shift notes down/right so digit 1 (top-left of the 3×3) does not sit under cage sums.
  const inset = hasCageSumLabel
    ? { top: 12, right: 3, bottom: 3, left: 16 }
    : { top: 5, right: 3, bottom: 3, left: 8 };
  return (
    <div
      style={{
        position: "absolute",
        ...inset,
        zIndex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        pointerEvents: "none",
      }}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <span key={n} style={noteStyle}>
          {mask & (1 << (n - 1)) ? n : ""}
        </span>
      ))}
    </div>
  );
}

function makeInitialState(): BoardState {
  return {
    values: Array.from({ length: 9 }, () => Array(9).fill(0)),
    notes: emptyNotesGrid(),
    selected: null,
    errors: Array.from({ length: 9 }, () => Array(9).fill(false)),
    completed: false,
    failed: false,
    mistakes: 0,
    mistakeUndoStack: [],
    startedAt: null,
    elapsedSecs: 0,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(
  state: BoardState,
  action: Action,
  puzzle: KillerSudokuPuzzle
): BoardState {
  switch (action.type) {
    case "SELECT":
      if (state.completed || state.failed) return state;
      return {
        ...state,
        startedAt: state.startedAt ?? Date.now(),
        selected:
          state.selected?.[0] === action.row && state.selected?.[1] === action.col
            ? null
            : [action.row, action.col],
      };

    case "INPUT": {
      if (!state.selected || state.completed || state.failed) return state;
      const [r, c] = state.selected;
      const cageMap = buildCageMap(puzzle.cages);

      if (action.asNote) {
        if (state.values[r][c] !== 0) return state;
        const bit = 1 << (action.num - 1);
        if (
          isKillerNoteAddBlocked(
            state.values,
            state.notes,
            cageMap,
            r,
            c,
            action.num
          )
        ) {
          return state;
        }
        const notes = cloneNotes(state.notes);
        notes[r][c] ^= bit;
        return { ...state, notes };
      }

      // No-op if the cell already shows this digit — avoids double-counting mistakes
      // and stacking duplicate undo snapshots.
      if (state.values[r][c] === action.num) return state;

      const correct = action.num === puzzle.solution[r][c];
      let mistakes = state.mistakes;
      if (!correct) mistakes = Math.min(MAX_MISTAKES, mistakes + 1);
      const failed = mistakes >= MAX_MISTAKES;

      const mistakeUndoStack = !correct
        ? [
            ...state.mistakeUndoStack,
            {
              values: cloneValues(state.values),
              notes: cloneNotes(state.notes),
              mistakes: state.mistakes,
            },
          ]
        : state.mistakeUndoStack;

      const values = state.values.map((row) => [...row]);
      values[r][c] = action.num;
      const notes = cloneNotes(state.notes);
      notes[r][c] = 0;
      if (correct) {
        clearDigitNotesFromRowColBox(notes, r, c, action.num);
        const cage = cageMap.get(`${r},${c}`);
        if (cage)
          clearDigitNotesFromCagePeers(notes, cage, action.num, r, c);
      }
      const errors = computeErrors(values, puzzle.cages);
      const completed = isComplete(values, puzzle.solution);
      return {
        ...state,
        values,
        notes,
        errors,
        completed,
        mistakes,
        failed,
        mistakeUndoStack,
      };
    }

    case "UNDO_MISTAKE": {
      if (state.mistakeUndoStack.length === 0) return state;
      const snap =
        state.mistakeUndoStack[state.mistakeUndoStack.length - 1];
      const mistakeUndoStack = state.mistakeUndoStack.slice(0, -1);
      const values = cloneValues(snap.values);
      const notes = cloneNotes(snap.notes);
      // Keep mistake tally — undo clears the wrong digit but does not erase a counted mistake.
      const mistakes = state.mistakes;
      const failed = mistakes >= MAX_MISTAKES;
      const errors = computeErrors(values, puzzle.cages);
      const completed = isComplete(values, puzzle.solution);
      return {
        ...state,
        values,
        notes,
        mistakes,
        failed,
        mistakeUndoStack,
        errors,
        completed,
      };
    }

    case "ERASE": {
      if (!state.selected || state.completed || state.failed) return state;
      const [r, c] = state.selected;
      const values = state.values.map((row) => [...row]);
      const notes = cloneNotes(state.notes);
      if (values[r][c] !== 0) {
        values[r][c] = 0;
      } else {
        notes[r][c] = 0;
      }
      return {
        ...state,
        values,
        notes,
        errors: computeErrors(values, puzzle.cages),
      };
    }

    case "TICK":
      if (state.completed || state.failed || !state.startedAt) return state;
      return { ...state, elapsedSecs: Math.floor((Date.now() - state.startedAt) / 1000) };

    case "RESET":
      return makeInitialState();

    default:
      return state;
  }
}

// ─── Cage border helpers ──────────────────────────────────────────────────────

/**
 * Build a Set of cage IDs indexed by "r,c" for fast lookups.
 */
function getCageBorders(r: number, c: number, cageMap: Map<string, Cage>) {
  const myCage = cageMap.get(`${r},${c}`);
  if (!myCage) {
    return { top: false, right: false, bottom: false, left: false };
  }

  const topCage = cageMap.get(`${r - 1},${c}`);
  const leftCage = cageMap.get(`${r},${c - 1}`);
  const rightCage = cageMap.get(`${r},${c + 1}`);
  const bottomCage = cageMap.get(`${r + 1},${c}`);

  return {
    top: !topCage || topCage.id !== myCage.id,
    left: !leftCage || leftCage.id !== myCage.id,
    right: !rightCage || rightCage.id !== myCage.id,
    bottom: !bottomCage || bottomCage.id !== myCage.id,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KillerSudokuCard({
  puzzle,
  onNewPuzzle,
  metricsEnabled = true,
  puzzleSignature,
}: KillerSudokuCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const completionLogged = useRef(false);

  const [state, dispatchRaw] = useReducer(
    (s: BoardState, a: Action) => reducer(s, a, puzzleRef.current),
    undefined,
    makeInitialState
  );
  const dispatch = dispatchRaw;
  const [lineFlashUnits, setLineFlashUnits] = useState<string[]>([]);
  const [notesMode, setNotesMode] = useState(false);
  const [selectionColor, setSelectionColor] = useGridSelectionColor();
  const lineCompleteRef = useRef<Set<string>>(new Set());
  const lastKillerPuzzleKeyRef = useRef<string>("");

  const cageMap = useMemo(() => buildCageMap(puzzle.cages), [puzzle.cages]);

  // Cache which cell gets each cage's sum label
  const sumLabelCells = useMemo(() => {
    const map = new Map<string, number>();
    for (const cage of puzzle.cages) {
      const [r, c] = cageTopLeft(cage);
      map.set(`${r},${c}`, cage.sum);
    }
    return map;
  }, [puzzle.cages]);

  // Timer
  useEffect(() => {
    if (state.completed || state.failed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.failed, state.startedAt, dispatch]);

  useEffect(() => {
    if (state.completed || state.failed || !state.startedAt) return;
    const now = completedSudokuUnits(state.values, puzzle.solution);
    const prev = lineCompleteRef.current;
    const newly = [...now].filter((k) => !prev.has(k));
    lineCompleteRef.current = new Set(now);
    if (newly.length > 0) setLineFlashUnits(newly);
  }, [
    state.values,
    puzzle.solution,
    state.completed,
    state.failed,
    state.startedAt,
  ]);

  useEffect(() => {
    if (lineFlashUnits.length === 0) return;
    const t = window.setTimeout(() => setLineFlashUnits([]), 780);
    return () => window.clearTimeout(t);
  }, [lineFlashUnits]);

  useEffect(() => {
    if (
      !metricsEnabled ||
      !state.completed ||
      state.failed ||
      completionLogged.current
    )
      return;
    completionLogged.current = true;
    const p = puzzleRef.current;
    void fetch("/api/user/game-completion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameType: "killer_sudoku",
        difficulty: p.difficulty,
        durationSeconds: state.elapsedSecs,
        metadata: { difficulty: p.difficulty, puzzleSignature },
      }),
    });
  }, [metricsEnabled, state.completed, state.failed, state.elapsedSecs]);

  // Keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [contenteditable='']"
        )
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (state.mistakeUndoStack.length > 0) {
          e.preventDefault();
          dispatch({ type: "UNDO_MISTAKE" });
        }
        return;
      }

      if (state.failed) return;
      if (!state.selected) return;
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        dispatch({ type: "INPUT", num, asNote: e.shiftKey || notesMode });
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        dispatch({ type: "ERASE" });
      } else if (e.key === "ArrowUp" && state.selected[0] > 0) dispatch({ type: "SELECT", row: state.selected[0] - 1, col: state.selected[1] });
      else if (e.key === "ArrowDown" && state.selected[0] < 8) dispatch({ type: "SELECT", row: state.selected[0] + 1, col: state.selected[1] });
      else if (e.key === "ArrowLeft" && state.selected[1] > 0) dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] - 1 });
      else if (e.key === "ArrowRight" && state.selected[1] < 8) dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] + 1 });
      else if (e.key === "n" || e.key === "N") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setNotesMode((v) => !v);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.selected, state.failed, state.mistakeUndoStack.length, dispatch, notesMode]);

  // Reset only when the puzzle solution identity changes (stable vs object reference).
  useEffect(() => {
    const pk = stableKillerPuzzleKey(puzzle);
    if (lastKillerPuzzleKeyRef.current === pk) return;
    lastKillerPuzzleKeyRef.current = pk;
    lineCompleteRef.current = new Set();
    setLineFlashUnits([]);
    dispatch({ type: "RESET" });
    completionLogged.current = false;
  }, [puzzle, dispatch]);

  // Peer highlighting
  const peers = useMemo(() => {
    const set = new Set<string>();
    if (!state.selected) return set;
    const [sr, sc] = state.selected;
    const selNum = state.values[sr][sc];
    const myCage = cageMap.get(`${sr},${sc}`);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const sameRow = r === sr, sameCol = c === sc;
        const sameBox = Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc / 3);
        const sameCage = myCage && cageMap.get(`${r},${c}`)?.id === myCage.id;
        if (sameRow || sameCol || sameBox || sameCage) set.add(`${r},${c}`);
        if (selNum !== 0 && state.values[r][c] === selNum) set.add(`${r},${c}`);
      }
    }
    return set;
  }, [state.selected, state.values, cageMap]);

  const cardStyle: React.CSSProperties = {
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    background: "#faf8f3",
    padding: "1.5rem 1.5rem 1.2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
  };

  const CELL = 40;

  // ── Game over (mistakes) ────────────────────────────────────────────────────
  if (state.failed && !state.completed) {
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>Killer Sudoku</span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.difficulty}
          </span>
        </div>
        <div style={{ width: "100%" }}>
          <GameHowToPlayLink href={GAME_HOW_TO_URL.killer_sudoku} />
        </div>
        <div style={{ textAlign: "center", padding: "2rem 1rem", fontFamily: "'Playfair Display', Georgia, serif", maxWidth: 400 }}>
          <div style={{ fontSize: "3.2rem", lineHeight: 1, marginBottom: "0.65rem" }} aria-hidden>☹</div>
          <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#5c4a32", marginBottom: "0.35rem" }}>
            Three cages worth of bad luck.
          </div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", fontSize: "0.9rem", lineHeight: 1.5 }}>
            The sums were rooting for you. They have now left the chat.
          </div>
        </div>
        {state.mistakeUndoStack.length > 0 ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "UNDO_MISTAKE" })}
            style={{
              padding: "0.5rem 1.25rem",
              border: "1px solid #8b4513",
              background: "#faf6f0",
              color: "#5c4a32",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.82rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
              marginBottom: "0.35rem",
            }}
          >
            Undo last mistake
          </button>
        ) : null}
        {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} primary />}
      </div>
    );
  }

  // ── Completed banner ────────────────────────────────────────────────────────
  if (state.completed) {
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>Killer Sudoku</span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.difficulty}
          </span>
        </div>
        <div style={{ width: "100%" }}>
          <GameHowToPlayLink href={GAME_HOW_TO_URL.killer_sudoku} />
        </div>
        <div style={{ textAlign: "center", padding: "2rem 1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>Puzzle complete</div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", marginTop: "0.25rem", fontSize: "0.9rem" }}>
            Solved in {formatTime(state.elapsedSecs)}
          </div>
        </div>
        {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div style={cardStyle}>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>Killer Sudoku</span>
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span>{puzzle.difficulty}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", color: "#a67c52" }}>
            Mistakes {state.mistakes}/{MAX_MISTAKES}
          </span>
          {state.startedAt && <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(state.elapsedSecs)}</span>}
        </span>
      </div>
      <div style={{ width: "100%" }}>
        <GameHowToPlayLink href={GAME_HOW_TO_URL.killer_sudoku} />
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "0.45rem",
          marginBottom: "0.25rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          fontSize: "0.72rem",
          color: "#666",
        }}
      >
        <span>Selected cell</span>
        <input
          type="color"
          value={selectionColor}
          onChange={(e) => setSelectionColor(e.target.value)}
          title="Background color for the selected cell"
          aria-label="Selected cell color"
          style={{
            width: "2rem",
            height: "1.35rem",
            padding: 0,
            border: "1px solid #ccc",
            borderRadius: "3px",
            cursor: "pointer",
            background: "#faf8f3",
          }}
        />
      </div>

      {/* Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(9, ${CELL}px)`,
        gridTemplateRows: `repeat(9, ${CELL}px)`,
        border: "2px solid #1a1a1a",
        width: "min-content",
      }}>
        {state.values.map((row, r) =>
          row.map((val, c) => {
            const key = `${r},${c}`;
            const isSelected = state.selected?.[0] === r && state.selected?.[1] === c;
            const isPeer = peers.has(key);
            const isError = state.errors[r][c];
            const borders = getCageBorders(r, c, cageMap);
            const cageSum = sumLabelCells.get(key);
            const celebrating = cellInFlashUnits(r, c, lineFlashUnits);
            const wrongSolution =
              val !== 0 && val !== puzzle.solution[r][c];
            const badDigit = wrongSolution || isError;

            let bg = "#faf8f3";
            if (celebrating) bg = "#f0e6c8";
            else if (isSelected) bg = selectionColor;
            else if (isPeer) bg = "#ede9e1";
            if (wrongSolution && !celebrating) bg = "#fce8e6";

            // Box borders (outer grid — solid)
            const boxTop = r % 3 === 0 && r > 0;
            const boxLeft = c % 3 === 0 && c > 0;
            const boxRight = (c + 1) % 3 === 0 && c < 8;
            const boxBottom = (r + 1) % 3 === 0 && r < 8;
            // Cage dashed lines sit *inside* the cell so they don’t sit on the shared grid line.
            const innerCageTop = borders.top && !boxTop && r > 0;
            const innerCageBottom = borders.bottom && !boxBottom && r < 8;
            const innerCageLeft = borders.left && !boxLeft && c > 0;
            const innerCageRight = borders.right && !boxRight && c < 8;

            return (
              <div
                key={key}
                className={celebrating ? "sudoku-unit-celebrate" : undefined}
                onClick={() => dispatch({ type: "SELECT", row: r, col: c })}
                aria-label={
                  val !== 0
                    ? `Cell ${r + 1},${c + 1}, value ${val}`
                    : state.notes[r][c]
                      ? `Cell ${r + 1},${c + 1}, notes`
                      : `Cell ${r + 1},${c + 1}, empty`
                }
                style={{
                  width: CELL,
                  height: CELL,
                  position: "relative",
                  background: bg,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "1.1rem",
                  fontWeight: 400,
                  color: badDigit ? "#c0392b" : "#2c5282",
                  transition: "background 0.08s ease",
                  transformOrigin: "center center",
                  borderTop: boxTop ? "2px solid #1a1a1a" : "0.5px solid #ddd",
                  borderLeft: boxLeft ? "2px solid #1a1a1a" : "0.5px solid #ddd",
                  borderRight: boxRight ? "2px solid #1a1a1a" : "0.5px solid #ddd",
                  borderBottom: boxBottom ? "2px solid #1a1a1a" : "0.5px solid #ddd",
                }}
              >
                {/* Inset cage outline — dashed, inside the cell margin */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: CAGE_LINE_INSET,
                    top: CAGE_LINE_INSET,
                    right: CAGE_LINE_INSET,
                    bottom: CAGE_LINE_INSET,
                    zIndex: 0,
                    pointerEvents: "none",
                    borderTop: innerCageTop ? "1.5px dashed #666" : "none",
                    borderLeft: innerCageLeft ? "1.5px dashed #666" : "none",
                    borderRight: innerCageRight ? "1.5px dashed #666" : "none",
                    borderBottom: innerCageBottom ? "1.5px dashed #666" : "none",
                  }}
                />
                {/* Cage sum label — top-left corner of each cage */}
                {cageSum !== undefined && (
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: 4,
                      zIndex: 2,
                      fontSize: "0.55rem",
                      fontWeight: 700,
                      color: "#1a472a",
                      fontFamily: "Georgia, serif",
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}
                  >
                    {cageSum}
                  </span>
                )}
                {val !== 0 ? (
                  val
                ) : (
                  <KillerCellNotes
                    mask={state.notes[r][c]}
                    hasCageSumLabel={cageSum !== undefined}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Number pad */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "center", alignItems: "center", width: "min(380px, 100%)" }}>
        <button
          type="button"
          onClick={() => setNotesMode((v) => !v)}
          aria-pressed={notesMode}
          style={{
            width: "auto",
            minWidth: "4.2rem",
            height: "2.6rem",
            padding: "0 0.55rem",
            border: notesMode ? "2px solid #1a5f3c" : "1px solid #1a1a1a",
            background: notesMode ? "#e8f2ec" : "#faf8f3",
            color: notesMode ? "#1a5f3c" : "#1a1a1a",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: "2px",
          }}
        >
          Notes
        </button>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
          const noteAddBlocked =
            notesMode &&
            state.selected !== null &&
            isKillerNoteAddBlocked(
              state.values,
              state.notes,
              cageMap,
              state.selected[0],
              state.selected[1],
              num
            );
          return (
            <button
              key={num}
              type="button"
              disabled={Boolean(noteAddBlocked)}
              onClick={() => dispatch({ type: "INPUT", num, asNote: notesMode })}
              aria-label={
                notesMode
                  ? noteAddBlocked
                    ? `${num} already in row, column, box, or cage`
                    : `Toggle note ${num}`
                  : `Enter ${num}`
              }
              style={{
                width: "2.6rem",
                height: "2.6rem",
                border: "1px solid #1a1a1a",
                background: "#faf8f3",
                color: "#1a1a1a",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1rem",
                fontWeight: 700,
                cursor: noteAddBlocked ? "not-allowed" : "pointer",
                opacity: noteAddBlocked ? 0.45 : 1,
              }}
            >
              {num}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => dispatch({ type: "ERASE" })}
          style={{
            padding: "0 0.75rem", height: "2.6rem",
            border: "1px solid #1a1a1a",
            background: "#faf8f3", color: "#888",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.7rem", letterSpacing: "0.05em",
            textTransform: "uppercase", cursor: "pointer",
          }}
        >
          Erase
        </button>
        {state.mistakeUndoStack.length > 0 ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "UNDO_MISTAKE" })}
            style={{
              padding: "0 0.75rem",
              height: "2.6rem",
              border: "1px solid #8b4513",
              background: "#faf6f0",
              color: "#5c4a32",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.7rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            aria-label="Undo last mistake"
          >
            Undo
          </button>
        ) : null}
      </div>

      {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}

      <p style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.72rem", color: "#bbb", margin: 0, textAlign: "center", maxWidth: 380, lineHeight: 1.45 }}>
        No digits are given — use the cage sums as your only clues.
        <span style={{ display: "block", marginTop: "0.35rem" }}>
          <strong style={{ fontWeight: 600, color: "#888" }}>Notes</strong> or{" "}
          <strong style={{ fontWeight: 600, color: "#888" }}>Shift+digit</strong> for pencil marks;{" "}
          <strong style={{ fontWeight: 600, color: "#888" }}>N</strong> toggles notes mode.
        </span>
        <span style={{ display: "block", marginTop: "0.35rem" }}>
          Wrong digits in <strong style={{ fontWeight: 600, color: "#c0392b" }}>red</strong>;{" "}
          <strong style={{ fontWeight: 600, color: "#888" }}>Undo</strong> or{" "}
          <strong style={{ fontWeight: 600, color: "#888" }}>Ctrl+Z</strong> clears the last wrong digit — mistakes stay counted.
        </span>
      </p>
    </div>
  );
}

function DifficultyButtons({
  current,
  onSelect,
  primary = false,
}: {
  current: Difficulty;
  onSelect: (d: Difficulty) => void;
  primary?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
      {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onSelect(d)}
          style={{
            padding: primary ? "0.45rem 1.1rem" : "0.3rem 0.8rem",
            border: primary ? "2px solid #1a1a1a" : "1px solid #ccc",
            background: d === current ? "#1a1a1a" : primary ? "#faf8f3" : "transparent",
            color: d === current ? "#faf8f3" : primary ? "#1a1a1a" : "#888",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: primary ? "0.78rem" : "0.68rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {primary ? `New ${d}` : d}
        </button>
      ))}
    </div>
  );
}
