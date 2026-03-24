"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { KillerSudokuPuzzle, Cage, Difficulty } from "@/lib/games/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoardState {
  values: number[][];
  selected: [number, number] | null;
  errors: boolean[][];
  completed: boolean;
  startedAt: number | null;
  elapsedSecs: number;
}

type Action =
  | { type: "SELECT"; row: number; col: number }
  | { type: "INPUT"; num: number }
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

function makeInitialState(): BoardState {
  return {
    values: Array.from({ length: 9 }, () => Array(9).fill(0)),
    selected: null,
    errors: Array.from({ length: 9 }, () => Array(9).fill(false)),
    completed: false,
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
      if (state.completed) return state;
      return {
        ...state,
        startedAt: state.startedAt ?? Date.now(),
        selected:
          state.selected?.[0] === action.row && state.selected?.[1] === action.col
            ? null
            : [action.row, action.col],
      };

    case "INPUT": {
      if (!state.selected || state.completed) return state;
      const [r, c] = state.selected;
      const values = state.values.map((row) => [...row]);
      values[r][c] = action.num;
      const errors = computeErrors(values, puzzle.cages);
      const completed = isComplete(values, puzzle.solution);
      return { ...state, values, errors, completed };
    }

    case "ERASE": {
      if (!state.selected || state.completed) return state;
      const [r, c] = state.selected;
      const values = state.values.map((row) => [...row]);
      values[r][c] = 0;
      return { ...state, values, errors: computeErrors(values, puzzle.cages) };
    }

    case "TICK":
      if (state.completed || !state.startedAt) return state;
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
  if (!myCage) return { right: false, bottom: false };

  const rightCage = cageMap.get(`${r},${c + 1}`);
  const bottomCage = cageMap.get(`${r + 1},${c}`);

  return {
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
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  useEffect(() => {
    if (!metricsEnabled || !state.completed || completionLogged.current) return;
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
  }, [metricsEnabled, state.completed, state.elapsedSecs]);

  // Keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!state.selected) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) dispatch({ type: "INPUT", num });
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") dispatch({ type: "ERASE" });
      else if (e.key === "ArrowUp" && state.selected[0] > 0) dispatch({ type: "SELECT", row: state.selected[0] - 1, col: state.selected[1] });
      else if (e.key === "ArrowDown" && state.selected[0] < 8) dispatch({ type: "SELECT", row: state.selected[0] + 1, col: state.selected[1] });
      else if (e.key === "ArrowLeft" && state.selected[1] > 0) dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] - 1 });
      else if (e.key === "ArrowRight" && state.selected[1] < 8) dispatch({ type: "SELECT", row: state.selected[0], col: state.selected[1] + 1 });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.selected, dispatch]);

  // Reset on new puzzle
  useEffect(() => {
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
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem" }}>
          <span>{puzzle.difficulty}</span>
          {state.startedAt && <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(state.elapsedSecs)}</span>}
        </span>
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

            let bg = "#faf8f3";
            if (isSelected) bg = "#d4c27a";
            else if (isPeer) bg = "#ede9e1";

            // Box borders
            const boxRight = (c + 1) % 3 === 0 && c < 8;
            const boxBottom = (r + 1) % 3 === 0 && r < 8;

            return (
              <div
                key={key}
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
                  color: isError ? "#c0392b" : "#2c5282",
                  transition: "background 0.08s ease",
                  // Cage border (dashed, inside) wins over box border (solid, outside)
                  borderRight: boxRight ? "2px solid #1a1a1a" : borders.right ? "1.5px dashed #888" : "0.5px solid #ddd",
                  borderBottom: boxBottom ? "2px solid #1a1a1a" : borders.bottom ? "1.5px dashed #888" : "0.5px solid #ddd",
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
      </div>

      {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}

      <p style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.72rem", color: "#bbb", margin: 0 }}>
        No digits are given — use the cage sums as your only clues
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
