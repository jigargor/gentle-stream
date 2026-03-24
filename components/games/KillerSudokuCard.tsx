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

const MAX_MISTAKES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

interface KillerMistakeUndoSnapshot {
  values: number[][];
}

interface BoardState {
  values: number[][];
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
  | { type: "INPUT"; num: number }
  | { type: "UNDO_MISTAKE" }
  | { type: "ERASE" }
  | { type: "TICK" }
  | { type: "RESET" };

interface KillerSudokuCardProps {
  puzzle: KillerSudokuPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
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

function makeInitialState(): BoardState {
  return {
    values: Array.from({ length: 9 }, () => Array(9).fill(0)),
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
      if (state.values[r][c] === action.num) return state;

      const correct = action.num === puzzle.solution[r][c];
      let mistakes = state.mistakes;
      if (!correct) mistakes = Math.min(MAX_MISTAKES, mistakes + 1);
      const failed = mistakes >= MAX_MISTAKES;

      const mistakeUndoStack = !correct
        ? [
            ...state.mistakeUndoStack,
            { values: cloneValues(state.values) },
          ]
        : state.mistakeUndoStack;

      const values = state.values.map((row) => [...row]);
      values[r][c] = action.num;
      const errors = computeErrors(values, puzzle.cages);
      const completed = isComplete(values, puzzle.solution);
      return {
        ...state,
        values,
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
      const mistakes = Math.max(0, state.mistakes - 1);
      const failed = mistakes >= MAX_MISTAKES;
      const errors = computeErrors(values, puzzle.cages);
      const completed = isComplete(values, puzzle.solution);
      return {
        ...state,
        values,
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
      values[r][c] = 0;
      return { ...state, values, errors: computeErrors(values, puzzle.cages) };
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
        metadata: { difficulty: p.difficulty },
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
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) dispatch({ type: "INPUT", num });
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") dispatch({ type: "ERASE" });
      else if (e.key === "ArrowUp" && state.selected[0] > 0) dispatch({ type: "SELECT", row: state.selected[0] - 1, col: state.selected[1] });
      else if (e.key === "ArrowDown" && state.selected[0] < 8) dispatch({ type: "SELECT", row: state.selected[0] + 1, col: state.selected[1] });
      else if (e.key === "ArrowLeft" && state.selected[1] > 0) dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] - 1 });
      else if (e.key === "ArrowRight" && state.selected[1] < 8) dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] + 1 });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.selected, state.failed, state.mistakeUndoStack.length, dispatch]);

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
            else if (isSelected) bg = "#d4c27a";
            else if (isPeer) bg = "#ede9e1";
            if (wrongSolution && !celebrating) bg = "#fce8e6";

            // Box borders
            const boxTop = r % 3 === 0 && r > 0;
            const boxLeft = c % 3 === 0 && c > 0;
            const boxRight = (c + 1) % 3 === 0 && c < 8;
            const boxBottom = (r + 1) % 3 === 0 && r < 8;

            return (
              <div
                key={key}
                className={celebrating ? "sudoku-unit-celebrate" : undefined}
                onClick={() => dispatch({ type: "SELECT", row: r, col: c })}
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
                  // Explicitly render all edges so cage outlines stay visible.
                  borderTop: boxTop
                    ? "2px solid #1a1a1a"
                    : borders.top
                    ? "1.5px dashed #888"
                    : "0.5px solid #ddd",
                  borderLeft: boxLeft
                    ? "2px solid #1a1a1a"
                    : borders.left
                    ? "1.5px dashed #888"
                    : "0.5px solid #ddd",
                  borderRight: boxRight
                    ? "2px solid #1a1a1a"
                    : borders.right
                    ? "1.5px dashed #888"
                    : "0.5px solid #ddd",
                  borderBottom: boxBottom
                    ? "2px solid #1a1a1a"
                    : borders.bottom
                    ? "1.5px dashed #888"
                    : "0.5px solid #ddd",
                }}
              >
                {/* Cage sum label — top-left corner of each cage */}
                {cageSum !== undefined && (
                  <span style={{
                    position: "absolute",
                    top: 2,
                    left: 3,
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    color: "#1a472a",
                    fontFamily: "Georgia, serif",
                    lineHeight: 1,
                    pointerEvents: "none",
                  }}>
                    {cageSum}
                  </span>
                )}
                {val !== 0 ? val : ""}
              </div>
            );
          })
        )}
      </div>

      {/* Number pad */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", justifyContent: "center", width: "min(380px, 100%)" }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => dispatch({ type: "INPUT", num })}
            style={{
              width: "2.6rem", height: "2.6rem",
              border: "1px solid #1a1a1a",
              background: "#faf8f3", color: "#1a1a1a",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            {num}
          </button>
        ))}
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
          Wrong digits in <strong style={{ fontWeight: 600, color: "#c0392b" }}>red</strong>;{" "}
          <strong style={{ fontWeight: 600, color: "#888" }}>Undo</strong> or{" "}
          <strong style={{ fontWeight: 600, color: "#888" }}>Ctrl+Z</strong> after a mistake.
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
