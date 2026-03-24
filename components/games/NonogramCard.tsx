"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { NonogramPuzzle, Difficulty } from "@/lib/games/types";
import {
  GAME_HOW_TO_URL,
  GameHowToPlayLink,
} from "@/components/games/GameHowToPlayLink";

// ─── Types ────────────────────────────────────────────────────────────────────

type CellState = "empty" | "filled" | "crossed"; // crossed = marked as empty by player

interface BoardState {
  cells: CellState[][];
  errors: boolean[][];   // rows/cols that violate their clue
  completed: boolean;
  startedAt: number | null;
  elapsedSecs: number;
  // Drag state — the brush mode is set on pointer-down and held for the drag
  dragMode: "fill" | "cross" | "erase" | null;
}

type Action =
  | { type: "PAINT"; row: number; col: number }
  | { type: "START_DRAG"; row: number; col: number }
  | { type: "END_DRAG" }
  | { type: "TICK" }
  | { type: "RESET" };

interface NonogramCardProps {
  puzzle: NonogramPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Validate a single line against its clue.
 * Returns true if the filled cells match the clue exactly.
 */
function lineMatchesClue(cells: CellState[], clue: number[]): boolean {
  const runs: number[] = [];
  let run = 0;
  for (const cell of cells) {
    if (cell === "filled") {
      run++;
    } else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  if (clue[0] === 0 && runs.length === 0) return true;
  if (runs.length !== clue.length) return false;
  return runs.every((r, i) => r === clue[i]);
}

function computeErrors(
  cells: CellState[][],
  rowClues: number[][],
  colClues: number[][]
): boolean[][] {
  const errors: boolean[][] = Array.from({ length: cells.length }, () =>
    Array(cells[0].length).fill(false)
  );

  // Check rows — only flag if the row is fully determined (no empty cells)
  for (let r = 0; r < cells.length; r++) {
    const rowFull = cells[r].every((c) => c !== "empty");
    if (rowFull && !lineMatchesClue(cells[r], rowClues[r])) {
      for (let c = 0; c < cells[r].length; c++) errors[r][c] = true;
    }
  }

  // Check columns
  for (let c = 0; c < cells[0].length; c++) {
    const col = cells.map((row) => row[c]);
    const colFull = col.every((v) => v !== "empty");
    if (colFull && !lineMatchesClue(col, colClues[c])) {
      for (let r = 0; r < cells.length; r++) errors[r][c] = true;
    }
  }

  return errors;
}

function isComplete(cells: CellState[][], solution: boolean[][]): boolean {
  return cells.every((row, r) =>
    row.every((cell, c) =>
      solution[r][c] ? cell === "filled" : cell !== "filled"
    )
  );
}

function makeInitialState(puzzle: NonogramPuzzle): BoardState {
  return {
    cells: Array.from({ length: puzzle.rows }, () =>
      Array(puzzle.cols).fill("empty") as CellState[]
    ),
    errors: Array.from({ length: puzzle.rows }, () => Array(puzzle.cols).fill(false)),
    completed: false,
    startedAt: null,
    elapsedSecs: 0,
    dragMode: null,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: BoardState, action: Action, puzzle: NonogramPuzzle): BoardState {
  switch (action.type) {
    case "START_DRAG": {
      if (state.completed) return state;
      const { row, col } = action;
      const current = state.cells[row][col];
      // Cycle: empty → filled → crossed → empty
      // The drag mode is the target state for this drag gesture
      const dragMode: BoardState["dragMode"] =
        current === "empty" ? "fill" :
        current === "filled" ? "cross" : "erase";

      const cells = state.cells.map((r) => [...r]) as CellState[][];
      cells[row][col] =
        dragMode === "fill" ? "filled" :
        dragMode === "cross" ? "crossed" : "empty";

      const errors = computeErrors(cells, puzzle.rowClues, puzzle.colClues);
      const completed = isComplete(cells, puzzle.solution);

      return {
        ...state,
        cells,
        errors,
        completed,
        dragMode,
        startedAt: state.startedAt ?? Date.now(),
      };
    }

    case "PAINT": {
      if (!state.dragMode || state.completed) return state;
      const { row, col } = action;
      const cells = state.cells.map((r) => [...r]) as CellState[][];
      cells[row][col] =
        state.dragMode === "fill" ? "filled" :
        state.dragMode === "cross" ? "crossed" : "empty";

      const errors = computeErrors(cells, puzzle.rowClues, puzzle.colClues);
      const completed = isComplete(cells, puzzle.solution);
      return { ...state, cells, errors, completed };
    }

    case "END_DRAG":
      return { ...state, dragMode: null };

    case "TICK":
      if (state.completed || !state.startedAt) return state;
      return { ...state, elapsedSecs: Math.floor((Date.now() - state.startedAt) / 1000) };

    case "RESET":
      return makeInitialState(puzzle);

    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NonogramCard({
  puzzle,
  onNewPuzzle,
  metricsEnabled = true,
}: NonogramCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const completionLogged = useRef(false);

  const [state, dispatchRaw] = useReducer(
    (s: BoardState, a: Action) => reducer(s, a, puzzleRef.current),
    puzzle,
    makeInitialState
  );
  const dispatch = dispatchRaw;

  useEffect(() => {
    dispatch({ type: "RESET" });
    completionLogged.current = false;
  }, [puzzle, dispatch]);

  useEffect(() => {
    if (!metricsEnabled || !state.completed || completionLogged.current) return;
    completionLogged.current = true;
    const p = puzzleRef.current;
    void fetch("/api/user/game-completion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameType: "nonogram",
        difficulty: p.difficulty,
        durationSeconds: state.elapsedSecs,
        metadata: { rows: p.rows, cols: p.cols },
      }),
    });
  }, [metricsEnabled, state.completed, state.elapsedSecs]);

  useEffect(() => {
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  // Cell size based on grid dimensions
  const CELL = puzzle.cols <= 5 ? 44 : puzzle.cols <= 10 ? 32 : 22;
  const CLUE_W = puzzle.cols <= 5 ? 36 : puzzle.cols <= 10 ? 48 : 60;
  const CLUE_H = puzzle.rows <= 5 ? 28 : puzzle.rows <= 10 ? 36 : 44;
  const FONT = CELL * 0.48;

  const cardStyle: React.CSSProperties = {
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    background: "#faf8f3",
    padding: "1.5rem 1.5rem 1.2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  // ── Completed banner ────────────────────────────────────────────────────────
  if (state.completed) {
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>Nonogram</span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>{puzzle.difficulty}</span>
        </div>
        <div style={{ width: "100%" }}>
          <GameHowToPlayLink href={GAME_HOW_TO_URL.nonogram} />
        </div>
        <div style={{ textAlign: "center", padding: "2rem 1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>Picture revealed</div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", marginTop: "0.25rem", fontSize: "0.9rem" }}>
            Solved in {formatTime(state.elapsedSecs)}
          </div>
        </div>
        {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  // Column clues: max clue length determines header height
  const maxColClueLen = Math.max(...puzzle.colClues.map((c) => c.length));

  return (
    <div style={cardStyle}>
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>Nonogram</span>
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem" }}>
          <span>{puzzle.difficulty}</span>
          {state.startedAt && <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(state.elapsedSecs)}</span>}
        </span>
      </div>
      <div style={{ width: "100%" }}>
        <GameHowToPlayLink href={GAME_HOW_TO_URL.nonogram} />
      </div>

      {/* Puzzle grid with clues */}
      <div
        style={{ overflowX: "auto", maxWidth: "100%" }}
        onPointerUp={() => dispatch({ type: "END_DRAG" })}
        onPointerLeave={() => dispatch({ type: "END_DRAG" })}
      >
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              {/* Top-left spacer */}
              <td style={{ width: CLUE_W, height: CLUE_H * maxColClueLen }} />
              {/* Column clues */}
              {puzzle.colClues.map((clue, c) => (
                <td
                  key={c}
                  style={{
                    width: CELL,
                    height: CLUE_H * maxColClueLen,
                    verticalAlign: "bottom",
                    textAlign: "center",
                    paddingBottom: 4,
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: FONT * 0.85,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    borderLeft: c % 5 === 0 && c !== 0 ? "2px solid #aaa" : "0.5px solid #ddd",
                  }}
                >
                  {clue.map((n, i) => (
                    <div key={i} style={{ lineHeight: `${CLUE_H}px` }}>{n}</div>
                  ))}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.cells.map((row, r) => (
              <tr key={r}>
                {/* Row clue */}
                <td style={{
                  width: CLUE_W,
                  height: CELL,
                  textAlign: "right",
                  paddingRight: 6,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: FONT * 0.85,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  whiteSpace: "nowrap",
                  borderTop: r % 5 === 0 && r !== 0 ? "2px solid #aaa" : "0.5px solid #ddd",
                }}>
                  {puzzle.rowClues[r].join(" ")}
                </td>
                {/* Grid cells */}
                {row.map((cell, c) => {
                  const isError = state.errors[r][c];
                  const borderTop = r % 5 === 0 && r !== 0 ? "2px solid #aaa" : "0.5px solid #ddd";
                  const borderLeft = c % 5 === 0 && c !== 0 ? "2px solid #aaa" : "0.5px solid #ddd";

                  let bg = "#faf8f3";
                  let content: React.ReactNode = null;

                  if (cell === "filled") {
                    bg = isError ? "#c0392b" : "#1a1a1a";
                  } else if (cell === "crossed") {
                    content = (
                      <span style={{ fontSize: FONT * 0.7, color: "#aaa", lineHeight: 1, pointerEvents: "none" }}>×</span>
                    );
                  }

                  return (
                    <td
                      key={c}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        dispatch({ type: "START_DRAG", row: r, col: c });
                      }}
                      onPointerEnter={() => dispatch({ type: "PAINT", row: r, col: c })}
                      style={{
                        width: CELL,
                        height: CELL,
                        background: bg,
                        borderTop,
                        borderLeft,
                        cursor: "crosshair",
                        textAlign: "center",
                        verticalAlign: "middle",
                        transition: "background 0.05s ease",
                        touchAction: "none",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}

      <p style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.72rem", color: "#bbb", margin: 0, textAlign: "center" }}>
        Left-click to fill · click again to cross out · drag to paint
      </p>
    </div>
  );
}

function DifficultyButtons({ current, onSelect }: { current: Difficulty; onSelect: (d: Difficulty) => void }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
      {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
        <button key={d} onClick={() => onSelect(d)} style={{
          padding: "0.3rem 0.8rem",
          border: "1px solid #ccc",
          background: d === current ? "#1a1a1a" : "transparent",
          color: d === current ? "#faf8f3" : "#888",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.68rem", letterSpacing: "0.06em",
          textTransform: "uppercase", cursor: "pointer",
        }}>
          {d}
        </button>
      ))}
    </div>
  );
}
