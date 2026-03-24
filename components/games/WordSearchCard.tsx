"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { WordSearchPuzzle, PlacedWord, Difficulty } from "@/lib/games/types";

/** Unit steps for 8-way lines (row delta, col delta). */
const DIR8: [number, number][] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectionState {
  active: boolean;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface BoardState {
  words: PlacedWord[];       // tracks found status
  selection: SelectionState | null;
  completed: boolean;
  startedAt: number | null;
  elapsedSecs: number;
}

type Action =
  | { type: "START_SELECT"; row: number; col: number }
  | { type: "EXTEND_SELECT"; row: number; col: number }
  | { type: "END_SELECT" }
  | { type: "TICK" }
  | { type: "RESET"; puzzle: WordSearchPuzzle }
  | {
      type: "HYDRATE";
      words: PlacedWord[];
      elapsedSecs: number;
      startedAt: number | null;
    };

export interface WordSearchCloudSlice {
  words: PlacedWord[];
  elapsedSecs: number;
  startedAt: number | null;
}

interface WordSearchCardProps {
  puzzle: WordSearchPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  initialCloudSlice?: WordSearchCloudSlice | null;
  cloudSaveEnabled?: boolean;
  metricsEnabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Return all cells on a straight line from (r1,c1) to (r2,c2).
 * Returns [] if the line is not axis-aligned or diagonal.
 */
function lineCells(
  r1: number, c1: number, r2: number, c2: number
): [number, number][] {
  const dr = r2 - r1;
  const dc = c2 - c1;
  const len = Math.max(Math.abs(dr), Math.abs(dc));
  if (len === 0) return [[r1, c1]];

  // Must be horizontal, vertical, or 45° diagonal
  if (Math.abs(dr) !== 0 && Math.abs(dc) !== 0 && Math.abs(dr) !== Math.abs(dc)) {
    return [];
  }

  const stepR = len === 0 ? 0 : dr / len;
  const stepC = len === 0 ? 0 : dc / len;
  const cells: [number, number][] = [];
  for (let i = 0; i <= len; i++) {
    cells.push([Math.round(r1 + stepR * i), Math.round(c1 + stepC * i)]);
  }
  return cells;
}

/**
 * Snap raw end cell to the straight line from start that best matches the drag vector.
 * k is clamped so the segment stays inside the grid.
 */
function snapEndCell(
  sr: number,
  sc: number,
  er: number,
  ec: number,
  rows: number,
  cols: number
): [number, number] {
  const dr = er - sr;
  const dc = ec - sc;
  if (dr === 0 && dc === 0) return [sr, sc];

  const len = Math.hypot(dr, dc) || 1;
  const udr = dr / len;
  const udc = dc / len;

  let bestDir = DIR8[0]!;
  let bestDot = -Infinity;
  for (const [sdr, sdc] of DIR8) {
    const nd = Math.hypot(sdr, sdc);
    const dot = (udr * sdr + udc * sdc) / nd;
    if (dot > bestDot) {
      bestDot = dot;
      bestDir = [sdr, sdc];
    }
  }

  const [sdr, sdc] = bestDir;
  const denom = sdr * sdr + sdc * sdc;
  let k = Math.round((dr * sdr + dc * sdc) / denom);
  if (k < 0) k = 0;

  const maxK = maxStepsAlongRay(sr, sc, sdr, sdc, rows, cols);
  k = Math.min(k, maxK);
  return [sr + sdr * k, sc + sdc * k];
}

function maxStepsAlongRay(
  sr: number,
  sc: number,
  sdr: number,
  sdc: number,
  rows: number,
  cols: number
): number {
  let k = 0;
  for (;;) {
    const r = sr + sdr * (k + 1);
    const c = sc + sdc * (k + 1);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return k;
    k++;
  }
}

function cellFromClient(
  gridEl: HTMLElement,
  clientX: number,
  clientY: number,
  rows: number,
  cols: number,
  cellSize: number
): { r: number; c: number } | null {
  const rect = gridEl.getBoundingClientRect();
  const cs = getComputedStyle(gridEl);
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const x = clientX - rect.left - bl;
  const y = clientY - rect.top - bt;
  const innerW = rect.width - bl - (parseFloat(cs.borderRightWidth) || 0);
  const innerH = rect.height - bt - (parseFloat(cs.borderBottomWidth) || 0);
  if (x < 0 || y < 0 || x >= innerW || y >= innerH) return null;

  const c = Math.min(cols - 1, Math.max(0, Math.floor(x / cellSize)));
  const r = Math.min(rows - 1, Math.max(0, Math.floor(y / cellSize)));
  return { r, c };
}

/**
 * Match selection to an unfound word (forward along the grid only).
 * Reverse / RTL placement can be enabled later via puzzle options.
 */
function matchSelection(
  sel: SelectionState,
  words: PlacedWord[],
  grid: string[][]
): PlacedWord | null {
  const cells = lineCells(sel.startRow, sel.startCol, sel.endRow, sel.endCol);
  if (cells.length < 2) return null;

  const selected = cells.map(([r, c]) => grid[r][c]).join("");

  for (const word of words) {
    if (word.found) continue;
    if (word.word === selected) return word;
  }
  return null;
}

function makeInitialState(puzzle: WordSearchPuzzle): BoardState {
  return {
    words: puzzle.words.map((w) => ({ ...w, found: false })),
    selection: null,
    completed: false,
    startedAt: null,
    elapsedSecs: 0,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(
  state: BoardState,
  action: Action,
  puzzle: WordSearchPuzzle
): BoardState {
  switch (action.type) {
    case "START_SELECT":
      if (state.completed) return state;
      return {
        ...state,
        startedAt: state.startedAt ?? Date.now(),
        selection: {
          active: true,
          startRow: action.row,
          startCol: action.col,
          endRow: action.row,
          endCol: action.col,
        },
      };

    case "EXTEND_SELECT": {
      if (!state.selection?.active) return state;
      const [endRow, endCol] = snapEndCell(
        state.selection.startRow,
        state.selection.startCol,
        action.row,
        action.col,
        puzzle.rows,
        puzzle.cols
      );
      return {
        ...state,
        selection: {
          ...state.selection,
          endRow,
          endCol,
        },
      };
    }

    case "END_SELECT": {
      if (!state.selection) return { ...state, selection: null };

      const match = matchSelection(state.selection, state.words, puzzle.grid);
      if (!match) return { ...state, selection: null };

      const words = state.words.map((w) =>
        w.word === match.word ? { ...w, found: true } : w
      );
      const completed = words.every((w) => w.found);

      return { ...state, words, selection: null, completed };
    }

    case "TICK":
      if (state.completed || !state.startedAt) return state;
      return {
        ...state,
        elapsedSecs: Math.floor((Date.now() - state.startedAt) / 1000),
      };

    case "RESET":
      return makeInitialState(action.puzzle);

    case "HYDRATE": {
      const words = action.words.map((w) => ({ ...w }));
      const completed = words.every((w) => w.found);
      return {
        ...state,
        words,
        elapsedSecs: action.elapsedSecs,
        startedAt: action.startedAt,
        completed,
        selection: null,
      };
    }

    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WordSearchCard({
  puzzle,
  onNewPuzzle,
  initialCloudSlice = null,
  cloudSaveEnabled = false,
  metricsEnabled = true,
}: WordSearchCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;

  const [state, dispatchRaw] = useReducer(
    (s: BoardState, a: Action) => reducer(s, a, puzzleRef.current),
    puzzle,
    makeInitialState
  );
  const dispatch = dispatchRaw;
  const stateRef = useRef(state);
  stateRef.current = state;
  const completionLogged = useRef(false);

  // Timer
  useEffect(() => {
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  // Reset + optional cloud hydrate
  useEffect(() => {
    dispatch({ type: "RESET", puzzle });
    if (initialCloudSlice) {
      dispatch({
        type: "HYDRATE",
        words: initialCloudSlice.words,
        elapsedSecs: initialCloudSlice.elapsedSecs,
        startedAt: initialCloudSlice.startedAt,
      });
    }
    completionLogged.current = false;
  }, [puzzle, initialCloudSlice, dispatch]);

  useEffect(() => {
    if (!cloudSaveEnabled) return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (s.completed) return;
      const p = puzzleRef.current;
      void fetch("/api/user/game-save", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "word_search",
          difficulty: p.difficulty,
          elapsedSeconds: s.elapsedSecs,
          gameState: {
            puzzle: p,
            wordSearch: {
              words: s.words,
              elapsedSecs: s.elapsedSecs,
              startedAt: s.startedAt,
            },
          },
        }),
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [cloudSaveEnabled]);

  useEffect(() => {
    if (!state.completed || completionLogged.current) return;
    const shouldPost = metricsEnabled;
    const shouldClearCloud = cloudSaveEnabled;
    if (!shouldPost && !shouldClearCloud) return;
    completionLogged.current = true;
    const p = puzzleRef.current;
    if (shouldPost) {
      void fetch("/api/user/game-completion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "word_search",
          difficulty: p.difficulty,
          durationSeconds: state.elapsedSecs,
          metadata: { theme: p.theme },
        }),
      });
    }
    if (shouldClearCloud) {
      void fetch("/api/user/game-save?gameType=word_search", {
        method: "DELETE",
        credentials: "include",
      });
    }
  }, [metricsEnabled, cloudSaveEnabled, state.completed, state.elapsedSecs]);

  // ── Cell highlighting ────────────────────────────────────────────────────────

  // Build a set of "found" cells from all found words
  const foundCells = useMemo(() => {
    const set = new Set<string>();
    for (const word of state.words) {
      if (!word.found) continue;
      const cells = getWordCells(word);
      cells.forEach(([r, c]) => set.add(`${r},${c}`));
    }
    return set;
  }, [state.words]);

  // Cells currently in the drag selection
  const selectionCells = useMemo(() => {
    if (!state.selection) return new Set<string>();
    const cells = lineCells(
      state.selection.startRow,
      state.selection.startCol,
      state.selection.endRow,
      state.selection.endCol
    );
    const set = new Set<string>();
    cells.forEach(([r, c]) => set.add(`${r},${c}`));
    return set;
  }, [state.selection]);

  // ── Pointer: hit-test the grid from client coords so fast drags never skip cells ──

  const CELL_SIZE = puzzle.cols <= 10 ? 34 : puzzle.cols <= 13 ? 28 : 24;
  const gridRef = useRef<HTMLDivElement>(null);

  const handleGridPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const el = gridRef.current;
      if (!el) return;
      const cell = cellFromClient(
        el,
        e.clientX,
        e.clientY,
        puzzle.rows,
        puzzle.cols,
        CELL_SIZE
      );
      if (!cell) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      dispatch({ type: "START_SELECT", row: cell.r, col: cell.c });
    },
    [dispatch, puzzle.rows, puzzle.cols, CELL_SIZE]
  );

  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = gridRef.current;
      if (!el || !el.hasPointerCapture(e.pointerId)) return;
      const cell = cellFromClient(
        el,
        e.clientX,
        e.clientY,
        puzzle.rows,
        puzzle.cols,
        CELL_SIZE
      );
      if (cell) dispatch({ type: "EXTEND_SELECT", row: cell.r, col: cell.c });
    },
    [dispatch, puzzle.rows, puzzle.cols, CELL_SIZE]
  );

  const handleGridPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = gridRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dispatch({ type: "END_SELECT" });
  }, [dispatch]);

  const handleGridLostCapture = useCallback(() => {
    dispatch({ type: "END_SELECT" });
  }, [dispatch]);

  // ── Style helpers ────────────────────────────────────────────────────────────

  function cellBg(r: number, c: number): string {
    const key = `${r},${c}`;
    if (selectionCells.has(key)) return "#d4c27a";
    if (foundCells.has(key)) return "#b8d4a8";
    return "transparent";
  }

  function cellColor(r: number, c: number): string {
    const key = `${r},${c}`;
    if (foundCells.has(key)) return "#1a472a";
    return "#1a1a1a";
  }

  // ── Completed banner ─────────────────────────────────────────────────────────

  const cardShell: React.CSSProperties = {
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

  if (state.completed) {
    return (
      <div style={cardShell}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
            Word Search
          </span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.theme}
          </span>
        </div>
        <div style={{ textAlign: "center", padding: "2rem 1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0d0d0d" }}>All words found</div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", marginTop: "0.25rem", fontSize: "0.9rem" }}>
            Solved in {formatTime(state.elapsedSecs)}
          </div>
        </div>
        {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div style={cardShell}>
      {/* Header */}
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
          Word Search
        </span>
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem" }}>
          <span>{puzzle.theme}</span>
          {state.startedAt && (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatTime(state.elapsedSecs)}
            </span>
          )}
        </span>
      </div>

      {/* Grid + word list side by side on wider screens, stacked on mobile */}
      <div style={{
        display: "flex",
        gap: "1.5rem",
        alignItems: "flex-start",
        flexWrap: "wrap",
        justifyContent: "center",
        width: "100%",
      }}>
        {/* Grid */}
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${puzzle.cols}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${puzzle.rows}, ${CELL_SIZE}px)`,
            border: "1.5px solid #1a1a1a",
            cursor: "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerUp}
          onLostPointerCapture={handleGridLostCapture}
        >
          {puzzle.grid.map((row, r) =>
            row.map((letter, c) => (
              <div
                key={`${r}-${c}`}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: `${CELL_SIZE * 0.48}px`,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontWeight: foundCells.has(`${r},${c}`) ? 700 : 400,
                  color: cellColor(r, c),
                  background: cellBg(r, c),
                  borderRight: (c + 1) % puzzle.cols !== 0 ? "0.5px solid #ddd" : "none",
                  borderBottom: (r + 1) % puzzle.rows !== 0 ? "0.5px solid #ddd" : "none",
                  transition: "background 0.06s ease",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {letter}
              </div>
            ))
          )}
        </div>

        {/* Word list */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.35rem",
          minWidth: "100px",
          paddingTop: "0.2rem",
        }}>
          {state.words.map((w) => (
            <div
              key={w.word}
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.82rem",
                fontWeight: w.found ? 700 : 400,
                color: w.found ? "#1a472a" : "#555",
                textDecoration: w.found ? "line-through" : "none",
                letterSpacing: "0.05em",
                transition: "color 0.2s ease",
              }}
            >
              {w.word}
            </div>
          ))}
        </div>
      </div>

      {/* Difficulty switcher */}
      {onNewPuzzle && <DifficultyButtons current={puzzle.difficulty} onSelect={onNewPuzzle} />}

      <p style={{
        fontFamily: "'IM Fell English', Georgia, serif",
        fontStyle: "italic",
        fontSize: "0.72rem",
        color: "#bbb",
        margin: 0,
      }}>
        Click and drag to select a word
      </p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DifficultyButtons({
  current,
  onSelect,
}: {
  current: Difficulty;
  onSelect: (d: Difficulty) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
      {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
        <button
          key={d}
          onClick={() => onSelect(d)}
          style={{
            padding: "0.3rem 0.8rem",
            border: "1px solid #ccc",
            background: d === current ? "#1a1a1a" : "transparent",
            color: d === current ? "#faf8f3" : "#888",
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
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const DIRECTION_DELTAS: Record<string, [number, number]> = {
  E:  [0,  1], W:  [0, -1],
  N:  [-1, 0], S:  [1,  0],
  NE: [-1, 1], NW: [-1,-1],
  SE: [1,  1], SW: [1, -1],
};

function getWordCells(word: PlacedWord): [number, number][] {
  const [dr, dc] = DIRECTION_DELTAS[word.direction];
  return Array.from({ length: word.word.length }, (_, i) => [
    word.row + dr * i,
    word.col + dc * i,
  ]);
}
