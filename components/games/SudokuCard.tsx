"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { SudokuPuzzle, Difficulty } from "@/lib/games/types";
import {
  GAME_HOW_TO_URL,
  GameHowToPlayLink,
} from "@/components/games/GameHowToPlayLink";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Bitmask: bit (n-1) set ⇔ pencil mark for digit n (1–9). */
type NoteMask = number;

interface BoardState {
  values: number[][];       // current board values (0 = empty)
  notes: NoteMask[][];      // pencil marks per cell (only for empty non-given cells)
  selected: [number, number] | null;
  errors: boolean[][];      // cells that conflict with Sudoku rules
  completed: boolean;
  startedAt: number | null; // timestamp ms
  elapsedSecs: number;
}

type Action =
  | { type: "SELECT"; row: number; col: number }
  | { type: "INPUT"; num: number; asNote?: boolean }
  | { type: "ERASE" }
  | { type: "TICK" }
  | { type: "RESET"; puzzle: SudokuPuzzle }
  | {
      type: "HYDRATE";
      values: number[][];
      notes: NoteMask[][];
      elapsedSecs: number;
      startedAt: number | null;
    };

export interface SudokuCloudSlice {
  values: number[][];
  notes: NoteMask[][];
  elapsedSecs: number;
  startedAt: number | null;
}

interface SudokuCardProps {
  puzzle: SudokuPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  /** Hero-column embed: softer frame */
  embedded?: boolean;
  /** Restore grid from cloud save (same puzzle as `puzzle` prop). */
  initialCloudSlice?: SudokuCloudSlice | null;
  /** Persist progress to `/api/user/game-save` on an interval */
  cloudSaveEnabled?: boolean;
  /** Log finished puzzles to `/api/user/game-completion` (feed metrics). */
  metricsEnabled?: boolean;
}

function CellNotes({ mask }: { mask: NoteMask }) {
  if (mask === 0) return null;
  const noteStyle: React.CSSProperties = {
    fontSize: "clamp(6px, 2.1vw, 9px)",
    fontWeight: 500,
    color: "#6b6560",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Playfair Display', Georgia, serif",
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: "2px",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeErrors(values: number[][], given: number[][]): boolean[][] {
  const errors: boolean[][] = Array.from({ length: 9 }, () => Array(9).fill(false));

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = values[r][c];
      if (v === 0 || given[r][c] !== 0) continue;

      // Check row
      for (let cc = 0; cc < 9; cc++) {
        if (cc !== c && values[r][cc] === v) { errors[r][c] = true; break; }
      }
      if (errors[r][c]) continue;

      // Check col
      for (let rr = 0; rr < 9; rr++) {
        if (rr !== r && values[rr][c] === v) { errors[r][c] = true; break; }
      }
      if (errors[r][c]) continue;

      // Check box
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      outer: for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
          if ((rr !== r || cc !== c) && values[rr][cc] === v) {
            errors[r][c] = true;
            break outer;
          }
        }
      }
    }
  }

  return errors;
}

function isComplete(values: number[][], solution: number[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (values[r][c] !== solution[r][c]) return false;
    }
  }
  return true;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function emptyNotesGrid(): NoteMask[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

function cloneNotes(notes: NoteMask[][]): NoteMask[][] {
  return notes.map((row) => [...row]);
}

function makeInitialState(puzzle: SudokuPuzzle): BoardState {
  return {
    values: puzzle.given.map((row) => [...row]),
    notes: emptyNotesGrid(),
    selected: null,
    errors: Array.from({ length: 9 }, () => Array(9).fill(false)),
    completed: false,
    startedAt: null,
    elapsedSecs: 0,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: BoardState, action: Action, puzzle: SudokuPuzzle): BoardState {
  switch (action.type) {
    case "SELECT": {
      if (state.completed) return state;
      const alreadySelected =
        state.selected?.[0] === action.row && state.selected?.[1] === action.col;
      return {
        ...state,
        selected: alreadySelected ? null : [action.row, action.col],
        startedAt: state.startedAt ?? Date.now(),
      };
    }

    case "INPUT": {
      if (!state.selected || state.completed) return state;
      const [r, c] = state.selected;
      if (puzzle.given[r][c] !== 0) return state; // can't overwrite givens

      if (action.asNote) {
        if (state.values[r][c] !== 0) return state;
        const notes = cloneNotes(state.notes);
        const bit = 1 << (action.num - 1);
        notes[r][c] ^= bit;
        return { ...state, notes };
      }

      const values = state.values.map((row) => [...row]);
      values[r][c] = action.num;
      const notes = cloneNotes(state.notes);
      notes[r][c] = 0;

      const errors = computeErrors(values, puzzle.given);
      const completed = isComplete(values, puzzle.solution);

      return { ...state, values, notes, errors, completed };
    }

    case "ERASE": {
      if (!state.selected || state.completed) return state;
      const [r, c] = state.selected;
      if (puzzle.given[r][c] !== 0) return state;

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
        errors: computeErrors(values, puzzle.given),
      };
    }

    case "TICK": {
      if (state.completed || !state.startedAt) return state;
      return {
        ...state,
        elapsedSecs: Math.floor((Date.now() - state.startedAt) / 1000),
      };
    }

    case "RESET":
      return makeInitialState(action.puzzle);

    case "HYDRATE": {
      const values = action.values.map((row) => [...row]);
      const notes = action.notes.map((row) => [...row]);
      const errors = computeErrors(values, puzzle.given);
      const completed = isComplete(values, puzzle.solution);
      return {
        ...state,
        values,
        notes,
        elapsedSecs: action.elapsedSecs,
        startedAt: action.startedAt,
        errors,
        completed,
        selected: null,
      };
    }

    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SudokuCard({
  puzzle,
  onNewPuzzle,
  embedded = false,
  initialCloudSlice = null,
  cloudSaveEnabled = false,
  metricsEnabled = true,
}: SudokuCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;

  const [state, dispatchRaw] = useReducer(
    (s: BoardState, a: Action) => reducer(s, a, puzzleRef.current),
    puzzle,
    makeInitialState
  );

  const dispatch = dispatchRaw;
  const [notesMode, setNotesMode] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const completionLogged = useRef(false);

  // Timer
  useEffect(() => {
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  // Reset + optional hydrate when puzzle / saved slice changes
  useEffect(() => {
    dispatch({ type: "RESET", puzzle });
    if (initialCloudSlice) {
      dispatch({
        type: "HYDRATE",
        values: initialCloudSlice.values,
        notes: initialCloudSlice.notes,
        elapsedSecs: initialCloudSlice.elapsedSecs,
        startedAt: initialCloudSlice.startedAt,
      });
    }
    completionLogged.current = false;
  }, [puzzle, initialCloudSlice, dispatch]);

  // Cloud auto-save (30s)
  useEffect(() => {
    if (!cloudSaveEnabled || embedded) return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (s.completed) return;
      const p = puzzleRef.current;
      void fetch("/api/user/game-save", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "sudoku",
          difficulty: p.difficulty,
          elapsedSeconds: s.elapsedSecs,
          gameState: {
            puzzle: p,
            sudoku: {
              values: s.values,
              notes: s.notes,
              elapsedSecs: s.elapsedSecs,
              startedAt: s.startedAt,
            },
          },
        }),
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [cloudSaveEnabled, embedded]);

  // Log completion + clear cloud save slot (metrics independent of cloud resume)
  useEffect(() => {
    if (!state.completed || completionLogged.current) return;
    const shouldPost = metricsEnabled;
    const shouldClearCloud = cloudSaveEnabled && !embedded;
    if (!shouldPost && !shouldClearCloud) return;
    completionLogged.current = true;
    const p = puzzleRef.current;
    if (shouldPost) {
      void fetch("/api/user/game-completion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "sudoku",
          difficulty: p.difficulty,
          durationSeconds: state.elapsedSecs,
          metadata: { difficulty: p.difficulty },
        }),
      });
    }
    if (shouldClearCloud) {
      void fetch("/api/user/game-save?gameType=sudoku", {
        method: "DELETE",
        credentials: "include",
      });
    }
  }, [metricsEnabled, cloudSaveEnabled, embedded, state.completed, state.elapsedSecs]);

  // Keyboard input (Shift+digit = toggle note without turning Notes mode on)
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

      if (!state.selected) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        dispatch({ type: "INPUT", num, asNote: e.shiftKey || notesMode });
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        dispatch({ type: "ERASE" });
      } else if (e.key === "ArrowUp" && state.selected[0] > 0) {
        dispatch({ type: "SELECT", row: state.selected[0] - 1, col: state.selected[1] });
      } else if (e.key === "ArrowDown" && state.selected[0] < 8) {
        dispatch({ type: "SELECT", row: state.selected[0] + 1, col: state.selected[1] });
      } else if (e.key === "ArrowLeft" && state.selected[1] > 0) {
        dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] - 1 });
      } else if (e.key === "ArrowRight" && state.selected[1] < 8) {
        dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] + 1 });
      } else if (e.key === "n" || e.key === "N") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setNotesMode((v) => !v);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.selected, dispatch, notesMode]);

  // Highlight — same row, col, box, or same number as selected cell
  const highlights = useMemo(() => {
    const h: ("peer" | "same-num" | "none")[][] = Array.from(
      { length: 9 }, () => Array(9).fill("none")
    );
    if (!state.selected) return h;
    const [sr, sc] = state.selected;
    const selNum = state.values[sr][sc];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const sameRow = r === sr;
        const sameCol = c === sc;
        const sameBox =
          Math.floor(r / 3) === Math.floor(sr / 3) &&
          Math.floor(c / 3) === Math.floor(sc / 3);
        if (sameRow || sameCol || sameBox) h[r][c] = "peer";
        if (selNum !== 0 && state.values[r][c] === selNum) h[r][c] = "same-num";
      }
    }
    return h;
  }, [state.selected, state.values]);

  const difficultyLabel = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  }[puzzle.difficulty];

  // ── Styles ──────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = embedded
    ? {
        borderTop: "none",
        borderBottom: "none",
        background: "transparent",
        padding: "0.5rem 0 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.85rem",
      }
    : {
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#faf8f3",
        padding: "1.5rem 1.5rem 1.2rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
      };

  const headerStyle: React.CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: "1.3rem",
    fontWeight: 700,
    color: "#0d0d0d",
    letterSpacing: "-0.01em",
  };

  const metaStyle: React.CSSProperties = {
    fontFamily: "'IM Fell English', Georgia, serif",
    fontStyle: "italic",
    fontSize: "0.78rem",
    color: "#888",
    display: "flex",
    gap: "1rem",
    alignItems: "center",
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(9, 1fr)",
    width: "min(360px, 100%)",
    aspectRatio: "1",
    border: "2px solid #1a1a1a",
    userSelect: "none",
  };

  // ── Cell renderer ────────────────────────────────────────────────────────────

  function cellStyle(r: number, c: number): React.CSSProperties {
    const isSelected = state.selected?.[0] === r && state.selected?.[1] === c;
    const isGiven = puzzle.given[r][c] !== 0;
    const isError = state.errors[r][c];
    const hl = highlights[r][c];
    const val = state.values[r][c];

    let bg = "#faf8f3";
    if (isSelected) bg = "#d4c27a";
    else if (hl === "same-num" && val !== 0) bg = "#e8d98a";
    else if (hl === "peer") bg = "#ede9e1";

    const borderRight = (c + 1) % 3 === 0 && c < 8
      ? "2px solid #1a1a1a"
      : "0.5px solid #ccc";
    const borderBottom = (r + 1) % 3 === 0 && r < 8
      ? "2px solid #1a1a1a"
      : "0.5px solid #ccc";

    return {
      position: "relative",
      background: bg,
      borderRight,
      borderBottom,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: isGiven ? "default" : "pointer",
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "clamp(12px, 2.5vw, 18px)",
      fontWeight: isGiven ? 700 : 400,
      color: isError
        ? "#c0392b"
        : isGiven
        ? "#0d0d0d"
        : "#2c5282",
      transition: "background 0.08s ease",
      WebkitTapHighlightColor: "transparent",
    };
  }

  // ── Number pad ───────────────────────────────────────────────────────────────

  const padStyle: React.CSSProperties = {
    display: "flex",
    gap: "0.4rem",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "min(360px, 100%)",
  };

  function padBtnStyle(num: number): React.CSSProperties {
    const selNum = state.selected
      ? state.values[state.selected[0]][state.selected[1]]
      : 0;
    const isActive = selNum === num;
    return {
      width: "2.6rem",
      height: "2.6rem",
      border: "1px solid #1a1a1a",
      background: isActive ? "#1a1a1a" : "#faf8f3",
      color: isActive ? "#faf8f3" : "#1a1a1a",
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "1rem",
      fontWeight: 700,
      cursor: "pointer",
      transition: "background 0.1s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    };
  }

  // ── Completed banner ─────────────────────────────────────────────────────────

  if (state.completed) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>Sudoku</span>
          <span style={metaStyle}>{difficultyLabel}</span>
        </div>
        <div style={{ width: "100%" }}>
          <GameHowToPlayLink href={GAME_HOW_TO_URL.sudoku} />
        </div>

        <div style={{
          textAlign: "center",
          padding: "2rem 1rem",
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0d0d0d" }}>
            Puzzle complete
          </div>
          <div style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            color: "#888",
            marginTop: "0.25rem",
            fontSize: "0.9rem",
          }}>
            Solved in {formatTime(state.elapsedSecs)}
          </div>
        </div>

        {onNewPuzzle && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => onNewPuzzle(d)}
                style={{
                  padding: "0.4rem 1rem",
                  border: "1px solid #1a1a1a",
                  background: d === puzzle.difficulty ? "#1a1a1a" : "#faf8f3",
                  color: d === puzzle.difficulty ? "#faf8f3" : "#1a1a1a",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.75rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                New {d}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Sudoku</span>
        <span style={metaStyle}>
          <span>{difficultyLabel}</span>
          {state.startedAt && (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTime(state.elapsedSecs)}
            </span>
          )}
        </span>
      </div>
      <div style={{ width: "100%" }}>
        <GameHowToPlayLink href={GAME_HOW_TO_URL.sudoku} />
      </div>

      {/* Grid */}
      <div style={gridStyle}>
        {state.values.map((row, r) =>
          row.map((val, c) => (
            <div
              key={`${r}-${c}`}
              style={cellStyle(r, c)}
              onClick={() => dispatch({ type: "SELECT", row: r, col: c })}
              aria-label={
                val !== 0
                  ? `Cell ${r + 1},${c + 1}, value ${val}`
                  : state.notes[r][c]
                    ? `Cell ${r + 1},${c + 1}, notes`
                    : `Cell ${r + 1},${c + 1}, empty`
              }
            >
              {val !== 0 ? (
                val
              ) : (
                <CellNotes mask={state.notes[r][c]} />
              )}
            </div>
          ))
        )}
      </div>

      {/* Number pad */}
      <div style={{ ...padStyle, alignItems: "center" }}>
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
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            style={padBtnStyle(num)}
            onClick={() =>
              dispatch({ type: "INPUT", num, asNote: notesMode })
            }
            aria-label={
              notesMode ? `Toggle note ${num}` : `Enter ${num}`
            }
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          style={{
            ...padBtnStyle(0),
            width: "auto",
            padding: "0 0.75rem",
            fontSize: "0.7rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}
          onClick={() => dispatch({ type: "ERASE" })}
          aria-label="Erase"
        >
          Erase
        </button>
      </div>

      {/* Controls */}
      {onNewPuzzle && (
        <div style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => onNewPuzzle(d)}
              style={{
                padding: "0.3rem 0.8rem",
                border: "1px solid #ccc",
                background: d === puzzle.difficulty ? "#1a1a1a" : "transparent",
                color: d === puzzle.difficulty ? "#faf8f3" : "#888",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.68rem",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      <p style={{
        fontFamily: "'IM Fell English', Georgia, serif",
        fontStyle: "italic",
        fontSize: "0.72rem",
        color: "#bbb",
        margin: 0,
        textAlign: "center",
        maxWidth: "min(360px, 100%)",
        lineHeight: 1.45,
      }}>
        Tap <strong style={{ fontWeight: 600, color: "#888" }}>Notes</strong> (or press{" "}
        <strong style={{ fontWeight: 600, color: "#888" }}>N</strong>) for pencil marks.
        <span style={{ display: "block", marginTop: "0.25rem" }}>
          <strong style={{ fontWeight: 600, color: "#888" }}>Shift</strong>+digit always toggles a note.
        </span>
      </p>
    </div>
  );
}
