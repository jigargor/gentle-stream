"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Difficulty } from "@/lib/games/types";
import type { CrosswordPuzzle } from "@/lib/games/crosswordIngestAgent";
import type { CrosswordSlot } from "@/lib/games/crosswordGridFiller";

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotWithClue = CrosswordSlot & { clue: string };

interface BoardState {
  letters: string[][];          // player's entries, "" = empty
  selected: { row: number; col: number } | null;
  activeSlot: SlotWithClue | null;
  completed: boolean;
  /** True after "Reveal all" — completion screen still shows the full grid. */
  fullGridReveal: boolean;
  startedAt: number | null;
  elapsedSecs: number;
  revealed: Set<string>;        // "r,c" cells the player revealed (hint / reveal)
  checked: boolean;             // whether errors are currently shown
  errors: boolean[][];          // cells that are wrong (after check)
  /** Letter-hint uses per word (key: `${number}-${direction}`), capped per word. */
  letterHintsUsed: Record<string, number>;
}

type Action =
  | { type: "SELECT_CELL"; row: number; col: number }
  | { type: "TYPE"; letter: string }
  | { type: "ERASE" }
  | { type: "TICK" }
  | { type: "CHECK" }
  | { type: "REVEAL_WORD" }
  | { type: "REVEAL_ALL" }
  | { type: "HINT_LETTER"; number: number; direction: "across" | "down" }
  | { type: "RESET" };

interface CrosswordCardProps {
  puzzle: CrosswordPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function makeEmpty(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

function makeEmptyBool(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(false));
}

/** Find which slot should be active for a given cell (prefers current direction) */
function findSlot(
  slots: SlotWithClue[],
  row: number,
  col: number,
  preferDirection: "across" | "down" | null
): SlotWithClue | null {
  const matching = slots.filter((s) => cellInSlot(s, row, col));
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];
  if (preferDirection) {
    const preferred = matching.find((s) => s.direction === preferDirection);
    if (preferred) return preferred;
  }
  return matching[0];
}

function cellInSlot(slot: SlotWithClue, row: number, col: number): boolean {
  const dr = slot.direction === "down" ? 1 : 0;
  const dc = slot.direction === "across" ? 1 : 0;
  for (let i = 0; i < slot.length; i++) {
    if (slot.row + dr * i === row && slot.col + dc * i === col) return true;
  }
  return false;
}

function nextEmpty(
  letters: string[][],
  slot: SlotWithClue
): [number, number] | null {
  const dr = slot.direction === "down" ? 1 : 0;
  const dc = slot.direction === "across" ? 1 : 0;
  for (let i = 0; i < slot.length; i++) {
    const r = slot.row + dr * i;
    const c = slot.col + dc * i;
    if (!letters[r][c]) return [r, c];
  }
  return null;
}

/** Max single-letter hints per entry — enough to unblock, not auto-solve. */
const MAX_LETTER_HINTS_PER_WORD = 2;

function slotKey(number: number, direction: "across" | "down"): string {
  return `${number}-${direction}`;
}

function isComplete(
  letters: string[][],
  puzzle: CrosswordPuzzle
): boolean {
  for (const slot of puzzle.slots) {
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    for (let i = 0; i < slot.length; i++) {
      const r = slot.row + dr * i;
      const c = slot.col + dc * i;
      if (letters[r]?.[c] !== slot.answer[i]) return false;
    }
  }
  return true;
}

function computeErrors(
  letters: string[][],
  puzzle: CrosswordPuzzle
): boolean[][] {
  const errors = makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length);
  for (const slot of puzzle.slots) {
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    for (let i = 0; i < slot.length; i++) {
      const r = slot.row + dr * i;
      const c = slot.col + dc * i;
      if (letters[r]?.[c] && letters[r][c] !== slot.answer[i]) {
        errors[r][c] = true;
      }
    }
  }
  return errors;
}

function makeInitialState(puzzle: CrosswordPuzzle): BoardState {
  return {
    letters: makeEmpty(puzzle.grid.length, puzzle.grid[0].length),
    selected: null,
    activeSlot: null,
    completed: false,
    fullGridReveal: false,
    startedAt: null,
    elapsedSecs: 0,
    revealed: new Set(),
    checked: false,
    errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length),
    letterHintsUsed: {},
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(
  state: BoardState,
  action: Action,
  puzzle: CrosswordPuzzle
): BoardState {
  switch (action.type) {
    case "SELECT_CELL": {
      const { row, col } = action;
      if (puzzle.grid[row]?.[col] === "#") return state;

      // Toggle direction if same cell clicked twice
      const currentDir = state.activeSlot?.direction ?? null;
      const newDir: "across" | "down" | null =
        state.selected?.row === row && state.selected?.col === col
          ? currentDir === "across" ? "down" : "across"
          : currentDir;

      const slot = findSlot(puzzle.slots as SlotWithClue[], row, col, newDir);
      return {
        ...state,
        selected: { row, col },
        activeSlot: slot,
        checked: false,
        errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length),
        startedAt: state.startedAt ?? Date.now(),
      };
    }

    case "TYPE": {
      if (!state.selected || state.completed) return state;
      const { row, col } = state.selected;
      const letter = action.letter.toUpperCase();

      const letters = state.letters.map((r) => [...r]);
      letters[row][col] = letter;

      // Advance cursor to next empty cell in active slot
      let selected = state.selected;
      if (state.activeSlot) {
        const next = nextEmpty(letters, state.activeSlot);
        if (next) selected = { row: next[0], col: next[1] };
      }

      const completed = isComplete(letters, puzzle);
      return { ...state, letters, selected, completed };
    }

    case "ERASE": {
      if (!state.selected || state.completed) return state;
      const { row, col } = state.selected;
      const letters = state.letters.map((r) => [...r]);
      letters[row][col] = "";
      return { ...state, letters, checked: false, errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length) };
    }

    case "CHECK": {
      const errors = computeErrors(state.letters, puzzle);
      return { ...state, checked: true, errors };
    }

    case "REVEAL_WORD": {
      if (!state.activeSlot) return state;
      const slot = state.activeSlot;
      const dr = slot.direction === "down" ? 1 : 0;
      const dc = slot.direction === "across" ? 1 : 0;
      const letters = state.letters.map((r) => [...r]);
      const revealed = new Set(state.revealed);
      for (let i = 0; i < slot.length; i++) {
        const r = slot.row + dr * i;
        const c = slot.col + dc * i;
        letters[r][c] = slot.answer[i];
        revealed.add(`${r},${c}`);
      }
      const completed = isComplete(letters, puzzle);
      return { ...state, letters, revealed, completed, checked: false, errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length) };
    }

    case "REVEAL_ALL": {
      const letters = puzzle.grid.map((row) => row.map((cell) => cell === "#" ? "#" : cell));
      const revealed = new Set<string>();
      for (let r = 0; r < puzzle.grid.length; r++) {
        for (let c = 0; c < puzzle.grid[0].length; c++) {
          if (puzzle.grid[r][c] !== "#") revealed.add(`${r},${c}`);
        }
      }
      return {
        ...state,
        letters,
        revealed,
        completed: true,
        fullGridReveal: true,
        checked: false,
        errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length),
      };
    }

    case "HINT_LETTER": {
      if (state.completed) return state;
      const slots = puzzle.slots as SlotWithClue[];
      const slot = slots.find(
        (s) => s.number === action.number && s.direction === action.direction
      );
      if (!slot) return state;

      const key = slotKey(slot.number, slot.direction);
      const used = state.letterHintsUsed[key] ?? 0;
      const cap = Math.min(MAX_LETTER_HINTS_PER_WORD, slot.length);
      if (used >= cap) return state;

      const dr = slot.direction === "down" ? 1 : 0;
      const dc = slot.direction === "across" ? 1 : 0;

      let targetI: number | null = null;
      for (let i = 0; i < slot.length; i++) {
        const r = slot.row + dr * i;
        const c = slot.col + dc * i;
        const ch = state.letters[r]?.[c] ?? "";
        const correct = slot.answer[i];
        if (!ch || ch !== correct) {
          targetI = i;
          break;
        }
      }
      if (targetI === null) return state;

      const letters = state.letters.map((row) => [...row]);
      const r = slot.row + dr * targetI;
      const c = slot.col + dc * targetI;
      letters[r][c] = slot.answer[targetI];
      const revealed = new Set(state.revealed);
      revealed.add(`${r},${c}`);
      const letterHintsUsed = { ...state.letterHintsUsed, [key]: used + 1 };
      const completed = isComplete(letters, puzzle);
      return {
        ...state,
        letters,
        revealed,
        letterHintsUsed,
        completed,
        fullGridReveal: false,
        checked: false,
        errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length),
      };
    }

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

const CELL = 38; // px per grid cell

interface CrosswordGridBoardProps {
  puzzle: CrosswordPuzzle;
  letters: string[][];
  selected: { row: number; col: number } | null;
  revealed: Set<string>;
  errors: boolean[][];
  checked: boolean;
  activeSlotCells: Set<string>;
  numberMap: Map<string, number>;
  onCellSelect?: (row: number, col: number) => void;
}

function CrosswordGridBoard({
  puzzle,
  letters,
  selected,
  revealed,
  errors,
  checked,
  activeSlotCells,
  numberMap,
  onCellSelect,
}: CrosswordGridBoardProps) {
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;
  const readOnly = onCellSelect == null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
        gridTemplateRows: `repeat(${rows}, ${CELL}px)`,
        border: "2px solid #1a1a1a",
        flexShrink: 0,
      }}
    >
      {puzzle.grid.map((row, r) =>
        row.map((cell, c) => {
          const key = `${r},${c}`;
          const isBlack = cell === "#";
          const isSelected =
            !readOnly && selected?.row === r && selected?.col === c;
          const isActiveSlot = activeSlotCells.has(key);
          const isRevealed = revealed.has(key);
          const isError = checked && errors[r]?.[c];
          const num = numberMap.get(key);
          const letter = letters[r]?.[c] ?? "";

          let bg = "#faf8f3";
          if (isBlack) bg = "#1a1a1a";
          else if (isSelected) bg = "#d4c27a";
          else if (isActiveSlot) bg = "#ede9e1";

          return (
            <div
              key={key}
              onClick={() => {
                if (!isBlack && onCellSelect) onCellSelect(r, c);
              }}
              style={{
                width: CELL,
                height: CELL,
                background: bg,
                position: "relative",
                cursor: isBlack ? "default" : readOnly ? "default" : "pointer",
                borderRight: c < cols - 1 ? "0.5px solid #ccc" : "none",
                borderBottom: r < rows - 1 ? "0.5px solid #ccc" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.08s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {num !== undefined && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: 2,
                    fontSize: "0.48rem",
                    fontWeight: 700,
                    fontFamily: "Georgia, serif",
                    color: "#1a1a1a",
                    lineHeight: 1,
                    pointerEvents: "none",
                  }}
                >
                  {num}
                </span>
              )}
              {!isBlack && letter && (
                <span
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: `${CELL * 0.52}px`,
                    fontWeight: 400,
                    color: isError ? "#c0392b" : isRevealed ? "#1a472a" : "#1a1a1a",
                    lineHeight: 1,
                    pointerEvents: "none",
                  }}
                >
                  {letter}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

const emptySlotCells = new Set<string>();

export default function CrosswordCard({
  puzzle,
  onNewPuzzle,
  metricsEnabled = true,
}: CrosswordCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const completionLogged = useRef(false);

  const [state, dispatchRaw] = useReducer(
    (s: BoardState, a: Action) => reducer(s, a, puzzleRef.current),
    puzzle,
    makeInitialState
  );
  const dispatch = dispatchRaw;

  const [activeTab, setActiveTab] = useState<"across" | "down">("across");

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
        gameType: "crossword",
        difficulty: p.difficulty,
        durationSeconds: state.elapsedSecs,
        metadata: {
          category: p.category,
          variant: p.variant ?? "unknown",
          revealedCells: state.revealed.size,
          revealAll: state.fullGridReveal,
        },
      }),
    });
  }, [
    metricsEnabled,
    state.completed,
    state.elapsedSecs,
    state.fullGridReveal,
    state.revealed.size,
  ]);

  useEffect(() => {
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  // Keyboard input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!state.selected) return;
      if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
        dispatch({ type: "TYPE", letter: e.key });
      } else if (e.key === "Backspace" || e.key === "Delete") {
        dispatch({ type: "ERASE" });
      } else if (e.key === "Tab") {
        e.preventDefault();
        // Move to next slot
        const slots = puzzle.slots as SlotWithClue[];
        const curIdx = state.activeSlot ? slots.indexOf(state.activeSlot) : -1;
        const next = slots[(curIdx + 1) % slots.length];
        dispatch({ type: "SELECT_CELL", row: next.row, col: next.col });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selected, state.activeSlot, puzzle.slots, dispatch]);

  // Build number map for cell labels
  const numberMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const slot of puzzle.slots) {
      map.set(`${slot.row},${slot.col}`, slot.number);
    }
    return map;
  }, [puzzle.slots]);

  // Active slot cells for highlight
  const activeSlotCells = useMemo(() => {
    if (!state.activeSlot) return new Set<string>();
    const slot = state.activeSlot;
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    const set = new Set<string>();
    for (let i = 0; i < slot.length; i++) {
      set.add(`${slot.row + dr * i},${slot.col + dc * i}`);
    }
    return set;
  }, [state.activeSlot]);

  // Sorted clues for the clue panel
  const acrossClues = useMemo(() =>
    (puzzle.slots as SlotWithClue[])
      .filter((s) => s.direction === "across")
      .sort((a, b) => a.number - b.number),
    [puzzle.slots]
  );
  const downClues = useMemo(() =>
    (puzzle.slots as SlotWithClue[])
      .filter((s) => s.direction === "down")
      .sort((a, b) => a.number - b.number),
    [puzzle.slots]
  );

  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;

  // ── Styles ──────────────────────────────────────────────────────────────────

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

  // ── Completed (full reveal — keep grid visible) ───────────────────────────

  if (state.completed && state.fullGridReveal) {
    const emptyErrors = makeEmptyBool(rows, cols);
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
            Crossword
          </span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.category}
          </span>
        </div>
        <div
          style={{
            width: "100%",
            padding: "0.55rem 0.75rem",
            background: "#ede9e1",
            borderLeft: "3px solid #6b7c3a",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.82rem",
            color: "#3d4429",
            lineHeight: 1.45,
          }}
        >
          Full solution shown — study the grid below, then start a new puzzle when you&apos;re ready.
        </div>
        <CrosswordGridBoard
          puzzle={puzzle}
          letters={state.letters}
          selected={null}
          revealed={state.revealed}
          errors={emptyErrors}
          checked={false}
          activeSlotCells={emptySlotCells}
          numberMap={numberMap}
        />
        {onNewPuzzle && (
          <button
            type="button"
            onClick={() => onNewPuzzle("medium")}
            style={{
              padding: "0.45rem 1.25rem",
              border: "1px solid #1a1a1a",
              background: "#1a1a1a",
              color: "#faf8f3",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            New puzzle
          </button>
        )}
      </div>
    );
  }

  // ── Completed (solved or partial reveal — compact win) ─────────────────────

  if (state.completed) {
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
            Crossword
          </span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.category}
          </span>
        </div>
        <div style={{ textAlign: "center", padding: "2rem 1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0d0d0d" }}>Puzzle complete</div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", marginTop: "0.25rem", fontSize: "0.9rem" }}>
            {state.revealed.size > 0 ? "Completed with hints or reveals" : `Solved in ${formatTime(state.elapsedSecs)}`}
          </div>
        </div>
        {onNewPuzzle && (
          <button onClick={() => onNewPuzzle("medium")} style={{
            padding: "0.4rem 1.2rem", border: "1px solid #1a1a1a",
            background: "#1a1a1a", color: "#faf8f3",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.75rem", letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: "pointer",
          }}>
            New puzzle
          </button>
        )}
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  const activeClue = state.activeSlot
    ? `${state.activeSlot.number} ${state.activeSlot.direction.toUpperCase()} — ${state.activeSlot.clue}`
    : "Click a cell to begin";

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
          Crossword
        </span>
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem" }}>
          <span>{puzzle.category}</span>
          {state.startedAt && <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(state.elapsedSecs)}</span>}
        </span>
      </div>

      {/* Active clue banner */}
      <div style={{
        width: "100%",
        padding: "0.5rem 0.75rem",
        background: "#ede9e1",
        borderLeft: "3px solid #1a1a1a",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "0.82rem",
        color: "#0d0d0d",
        minHeight: "2.4rem",
        display: "flex",
        alignItems: "center",
      }}>
        {activeClue}
      </div>

      {/* Grid + clue list side by side */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center", width: "100%" }}>

        <CrosswordGridBoard
          puzzle={puzzle}
          letters={state.letters}
          selected={state.selected}
          revealed={state.revealed}
          errors={state.errors}
          checked={state.checked}
          activeSlotCells={activeSlotCells}
          numberMap={numberMap}
          onCellSelect={(row, col) =>
            dispatch({ type: "SELECT_CELL", row, col })
          }
        />

        {/* Clue list */}
        <div style={{ flex: 1, minWidth: 180, maxWidth: 300 }}>
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", marginBottom: "0.5rem" }}>
            {(["across", "down"] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setActiveTab(dir)}
                style={{
                  flex: 1, padding: "0.25rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.68rem", letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "none",
                  borderBottom: activeTab === dir ? "2px solid #1a1a1a" : "2px solid transparent",
                  background: "transparent",
                  color: activeTab === dir ? "#1a1a1a" : "#aaa",
                  cursor: "pointer",
                }}
              >
                {dir}
              </button>
            ))}
          </div>
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "0.62rem",
              color: "#aaa",
              margin: "0.25rem 0 0.35rem",
              lineHeight: 1.35,
            }}
          >
            Letter: next blank or wrong square only — up to {MAX_LETTER_HINTS_PER_WORD} per entry.
          </p>

          {/* Clues */}
          <div style={{ maxHeight: rows * CELL + 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            {(activeTab === "across" ? acrossClues : downClues).map((slot) => {
              const isActive = state.activeSlot?.number === slot.number && state.activeSlot?.direction === slot.direction;
              const dr = slot.direction === "down" ? 1 : 0;
              const dc = slot.direction === "across" ? 1 : 0;
              const done = Array.from({ length: slot.length }, (_, i) =>
                state.letters[slot.row + dr * i]?.[slot.col + dc * i] === slot.answer[i]
              ).every(Boolean);
              const sk = slotKey(slot.number, slot.direction);
              const cap = Math.min(MAX_LETTER_HINTS_PER_WORD, slot.length);
              const hintsUsed = state.letterHintsUsed[sk] ?? 0;
              const hintsLeft = cap - hintsUsed;
              const canLetterHint = !done && hintsLeft > 0;

              return (
                <div
                  key={`${slot.number}-${slot.direction}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.25rem",
                    padding: "0.2rem 0.25rem",
                    background: isActive ? "#ede9e1" : "transparent",
                    borderRadius: 3,
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "SELECT_CELL",
                        row: slot.row,
                        col: slot.col,
                      })
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: done ? "#1a472a" : "#555",
                        marginRight: "0.3rem",
                      }}
                    >
                      {slot.number}.
                    </span>
                    <span
                      style={{
                        fontFamily: "Georgia, serif",
                        fontSize: "0.72rem",
                        color: done ? "#888" : "#333",
                        textDecoration: done ? "line-through" : "none",
                      }}
                    >
                      {slot.clue}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={
                      canLetterHint
                        ? `Reveal the next missing or incorrect letter in this word (${hintsLeft} left for this entry).`
                        : done
                          ? "Word is complete."
                          : "No letter hints left for this entry."
                    }
                    aria-label={`Letter hint for ${slot.number} ${slot.direction}`}
                    disabled={!canLetterHint}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({
                        type: "HINT_LETTER",
                        number: slot.number,
                        direction: slot.direction,
                      });
                    }}
                    style={{
                      flexShrink: 0,
                      marginTop: "0.05rem",
                      padding: "0.12rem 0.32rem",
                      border: "1px solid",
                      borderColor: canLetterHint ? "#8b7355" : "#e0dcd4",
                      background: canLetterHint ? "#faf6f0" : "transparent",
                      color: canLetterHint ? "#5c4a32" : "#ccc",
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: "0.58rem",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      cursor: canLetterHint ? "pointer" : "not-allowed",
                      lineHeight: 1.2,
                    }}
                  >
                    Letter{hintsUsed > 0 ? ` ${hintsLeft}` : ""}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <ActionBtn onClick={() => dispatch({ type: "CHECK" })}>Check</ActionBtn>
        <ActionBtn onClick={() => dispatch({ type: "REVEAL_WORD" })} disabled={!state.activeSlot}>Reveal word</ActionBtn>
        <ActionBtn
          onClick={() => {
            if (
              confirm(
                "Show the full solution? The completed grid will stay on screen so you can read it, then use New puzzle when you are done."
              )
            )
              dispatch({ type: "REVEAL_ALL" });
          }}
        >
          Reveal all
        </ActionBtn>
        {onNewPuzzle && <ActionBtn onClick={() => onNewPuzzle("medium")}>New puzzle</ActionBtn>}
      </div>

      <p style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.72rem", color: "#bbb", margin: 0 }}>
        Click a cell · type letters · Tab to next word · per-clue Letter hints are capped
      </p>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.3rem 0.8rem",
        border: "1px solid #ccc",
        background: "transparent",
        color: disabled ? "#ccc" : "#555",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "0.68rem", letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
