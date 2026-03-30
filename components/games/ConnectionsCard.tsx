"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ConnectionsPuzzle, ConnectionsGroup, ConnectionsTier } from "@/lib/games/connectionsIngestAgent";
import type { Difficulty } from "@/lib/games/types";

// ─── Tier colours (NYT Connections–style: yellow → green → blue → purple) ───

const TIER_STYLES: Record<ConnectionsTier, { bg: string; text: string; label: string }> = {
  1: { bg: "#f9df6d", text: "#121212", label: "Straightforward" },
  2: { bg: "#a0cf7a", text: "#121212", label: "Moderate" },
  3: { bg: "#b4c7e7", text: "#121212", label: "Tricky" },
  4: { bg: "#c1a7e2", text: "#121212", label: "Devious" },
};

const NYT_FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const TILE_DEFAULT_BG = "#efeee6";
const TILE_SELECTED_BG = "#5a5a5a";
const TILE_SELECTED_FG = "#ffffff";
const TILE_TEXT = "#121212";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameState {
  words: string[];              // all 16 words, shuffled
  selected: Set<string>;
  solved: ConnectionsTier[];    // tiers that have been correctly solved
  guesses: string[][];          // history of guesses
  mistakesLeft: number;
  completed: boolean;
  startedAt: number | null;
  elapsedSecs: number;
}

type Action =
  | { type: "TOGGLE"; word: string }
  | { type: "SUBMIT" }
  | { type: "DESELECT_ALL" }
  | { type: "SHUFFLE" }
  | { type: "TICK" }
  | { type: "RESET" };

interface ConnectionsCardProps {
  puzzle: ConnectionsPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
  puzzleSignature?: string;
  /** NYT-style: no "New puzzle"; completion ends the daily */
  dailyPuzzle?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getGroupForWord(puzzle: ConnectionsPuzzle, word: string): ConnectionsGroup | null {
  return puzzle.groups.find((g) => g.words.includes(word)) ?? null;
}

function initState(puzzle: ConnectionsPuzzle): GameState {
  return {
    words: shuffle(puzzle.groups.flatMap((g) => g.words)),
    selected: new Set(),
    solved: [],
    guesses: [],
    mistakesLeft: 4,
    completed: false,
    startedAt: null,
    elapsedSecs: 0,
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(
  state: GameState,
  action: Action,
  puzzle: ConnectionsPuzzle
): GameState {
  switch (action.type) {
    case "TOGGLE": {
      if (state.completed) return state;
      const sel = new Set(state.selected);
      if (sel.has(action.word)) {
        sel.delete(action.word);
      } else if (sel.size < 4) {
        sel.add(action.word);
      }
      return {
        ...state,
        selected: sel,
        startedAt: state.startedAt ?? Date.now(),
      };
    }

    case "SUBMIT": {
      if (state.selected.size !== 4 || state.completed) return state;
      const guessWords = [...state.selected];
      const guesses = [...state.guesses, guessWords];

      // Check if the guess matches any unsolved group exactly
      const matchedGroup = puzzle.groups.find(
        (g) =>
          !state.solved.includes(g.tier) &&
          g.words.every((w) => state.selected.has(w)) &&
          state.selected.size === g.words.length
      );

      if (matchedGroup) {
        const solved = [...state.solved, matchedGroup.tier];
        const remainingWords = state.words.filter((w) => !state.selected.has(w));
        const completed = solved.length === 4;
        return {
          ...state,
          words: remainingWords,
          selected: new Set(),
          solved,
          guesses,
          completed,
        };
      }

      // Check if one away (3 of 4 correct for an unsolved group)
      // — we track this for the "one away" hint but don't act on it here

      const mistakesLeft = state.mistakesLeft - 1;
      const completed = mistakesLeft === 0;
      return {
        ...state,
        selected: new Set(),
        guesses,
        mistakesLeft,
        completed,
      };
    }

    case "DESELECT_ALL":
      return { ...state, selected: new Set() };

    case "SHUFFLE":
      return { ...state, words: shuffle(state.words) };

    case "TICK":
      if (state.completed || !state.startedAt) return state;
      return { ...state, elapsedSecs: Math.floor((Date.now() - state.startedAt) / 1000) };

    case "RESET":
      return initState(puzzle);

    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConnectionsCard({
  puzzle,
  onNewPuzzle,
  metricsEnabled = true,
  puzzleSignature,
  dailyPuzzle = false,
}: ConnectionsCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const completionLogged = useRef(false);
  const completionDispatched = useRef(false);

  const [state, dispatchRaw] = useReducer(
    (s: GameState, a: Action) => reducer(s, a, puzzleRef.current),
    puzzle,
    initState
  );
  const dispatch = dispatchRaw;

  // Shake animation state for wrong guesses
  const [shaking, setShaking] = useState(false);
  // "One away" hint
  const [oneAwayHint, setOneAwayHint] = useState(false);
  // Show post-solve reveal panel
  const [showReveal, setShowReveal] = useState(false);

  useEffect(() => {
    dispatch({ type: "RESET" });
    completionLogged.current = false;
    completionDispatched.current = false;
  }, [puzzle, dispatch]);

  useEffect(() => {
    if (state.completed && !completionDispatched.current) {
      completionDispatched.current = true;
      try {
        // Completion is persisted via /api/user/game-completion (when authenticated).
      } catch {
        /* ignore */
      }
    }
  }, [state.completed]);

  useEffect(() => {
    if (!metricsEnabled || !state.completed || completionLogged.current) return;
    completionLogged.current = true;
    const p = puzzleRef.current;
    const solvedCount = state.solved.length;
    const won = solvedCount === 4;
    void fetch("/api/user/game-completion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameType: "connections",
        difficulty: p.difficulty,
        durationSeconds: state.elapsedSecs,
        metadata: {
          category: p.category,
          solvedCount,
          won,
          mistakesUsed: 4 - state.mistakesLeft,
          puzzleSignature,
        },
      }),
    });
  }, [metricsEnabled, state.completed, state.elapsedSecs, state.solved.length, state.mistakesLeft]);

  useEffect(() => {
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  const handleSubmit = useCallback(() => {
    if (state.selected.size !== 4) return;

    // Check if one away before submitting
    const oneAway = puzzle.groups.some(
      (g) =>
        !state.solved.includes(g.tier) &&
        g.words.filter((w) => state.selected.has(w)).length === 3
    );

    dispatch({ type: "SUBMIT" });

    // If wrong, trigger shake
    const isCorrect = puzzle.groups.some(
      (g) =>
        !state.solved.includes(g.tier) &&
        g.words.every((w) => state.selected.has(w))
    );

    if (!isCorrect) {
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      if (oneAway) {
        setOneAwayHint(true);
        setTimeout(() => setOneAwayHint(false), 2500);
      }
    }
  }, [state.selected, state.solved, puzzle.groups, dispatch]);

  // ── Styles ──────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e3e3e3",
    borderRadius: "4px",
    background: "#ffffff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    padding: "1.25rem 1.25rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "1rem",
    maxWidth: "560px",
    margin: "0 auto",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  const TILE_W = "calc(25% - 6px)";

  function tileStyle(word: string): React.CSSProperties {
    const isSelected = state.selected.has(word);

    return {
      width: TILE_W,
      minHeight: "42px",
      aspectRatio: "1.85 / 1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "6px 4px",
      boxSizing: "border-box",
      background: isSelected ? TILE_SELECTED_BG : TILE_DEFAULT_BG,
      color: isSelected ? TILE_SELECTED_FG : TILE_TEXT,
      fontFamily: NYT_FONT,
      fontSize: "clamp(0.7rem, 1.65vw, 0.8125rem)",
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      lineHeight: 1.25,
      cursor: "pointer",
      borderRadius: "4px",
      border: "none",
      transition: "background 0.1s ease, color 0.1s ease, transform 0.08s ease",
      transform: isSelected ? "scale(0.98)" : "scale(1)",
      WebkitTapHighlightColor: "transparent",
    };
  }

  // ── Mistakes indicator (NYT-style small dots) ───────────────────────────────
  const MistakeDots = () => (
    <div
      style={{
        display: "flex",
        gap: "10px",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontFamily: NYT_FONT,
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "#737373",
        }}
      >
        Mistakes remaining:
      </span>
      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: i < state.mistakesLeft ? "#3d3d3d" : "#e5e5e5",
              transition: "background 0.25s ease",
            }}
          />
        ))}
      </div>
    </div>
  );

  // ── Solved group row ─────────────────────────────────────────────────────────
  const SolvedRow = ({ group }: { group: ConnectionsGroup }) => {
    const style = TIER_STYLES[group.tier];
    return (
      <div
        style={{
          width: "100%",
          padding: "0.65rem 0.85rem",
          background: style.bg,
          borderRadius: "4px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: NYT_FONT,
            fontSize: "0.8125rem",
            fontWeight: 700,
            color: style.text,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {group.label}
        </div>
        <div
          style={{
            fontFamily: NYT_FONT,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: style.text,
            opacity: 0.92,
            marginTop: "0.35rem",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            lineHeight: 1.35,
          }}
        >
          {group.words.join(", ")}
        </div>
      </div>
    );
  };

  // ── Completed state ──────────────────────────────────────────────────────────
  if (state.completed) {
    const won = state.solved.length === 4;
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: NYT_FONT, fontSize: "1.125rem", fontWeight: 700, color: "#121212" }}>
            Connections
          </span>
          <span style={{ fontFamily: NYT_FONT, fontSize: "0.8125rem", color: "#737373", fontWeight: 500 }}>
            {puzzle.category}
            {dailyPuzzle ? " · Today’s puzzle" : ""}
          </span>
        </div>

        {/* All groups revealed (yellow → … → purple) */}
        {[...puzzle.groups]
          .sort((a, b) => a.tier - b.tier)
          .map((g) => (
            <SolvedRow key={g.tier} group={g} />
          ))}

        {/* Result */}
        <div style={{ textAlign: "center", padding: "0.35rem 0", fontFamily: NYT_FONT }}>
          <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#121212" }}>
            {won ? "Puzzle solved" : "Better luck next time"}
          </div>
          <div style={{ color: "#737373", fontSize: "0.875rem", marginTop: 6, fontWeight: 500 }}>
            {won
              ? `Completed in ${formatTime(state.elapsedSecs)} with ${4 - state.mistakesLeft} mistake${4 - state.mistakesLeft === 1 ? "" : "s"}`
              : `${state.solved.length} of 4 groups found`}
          </div>
        </div>

        {/* Red herrings reveal */}
        {puzzle.redHerrings.length > 0 && (
          <div style={{ width: "100%" }}>
            <button
              type="button"
              onClick={() => setShowReveal((v) => !v)}
              style={{
                width: "100%",
                padding: "0.5rem",
                background: "transparent",
                border: "1px solid #d4d4d4",
                borderRadius: "9999px",
                fontFamily: NYT_FONT,
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: "pointer",
                color: "#525252",
              }}
            >
              {showReveal ? "Hide" : "Show"} the traps
            </button>
            {showReveal && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: 6 }}>
                {puzzle.redHerrings.map((rh) => (
                  <div
                    key={rh.word}
                    style={{
                      padding: "0.45rem 0.65rem",
                      background: TILE_DEFAULT_BG,
                      borderRadius: "4px",
                      fontFamily: NYT_FONT,
                      fontSize: "0.8125rem",
                      color: "#525252",
                      lineHeight: 1.4,
                    }}
                  >
                    <strong style={{ color: TILE_TEXT }}>{rh.word}</strong>
                    {" — could also seem like: "}
                    {rh.couldAlsoBelong}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {onNewPuzzle && !dailyPuzzle && (
          <button
            type="button"
            onClick={() => onNewPuzzle("medium")}
            style={{
              alignSelf: "center",
              padding: "0.55rem 1.35rem",
              border: "none",
              borderRadius: "9999px",
              background: "#121212",
              color: "#ffffff",
              fontFamily: NYT_FONT,
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            New puzzle
          </button>
        )}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: NYT_FONT, fontSize: "1.125rem", fontWeight: 700, color: "#121212" }}>
          Connections
        </span>
        <span
          style={{
            fontFamily: NYT_FONT,
            fontSize: "0.8125rem",
            color: "#737373",
            fontWeight: 500,
            display: "flex",
            gap: "0.75rem",
            alignItems: "baseline",
          }}
        >
          <span>
            {puzzle.category}
            {dailyPuzzle ? " · Today’s puzzle" : ""}
          </span>
          {state.startedAt && (
            <span style={{ fontVariantNumeric: "tabular-nums", color: "#525252" }}>{formatTime(state.elapsedSecs)}</span>
          )}
        </span>
      </div>

      {/* Instruction — NYT-style centered prompt */}
      <p
        style={{
          margin: 0,
          fontFamily: NYT_FONT,
          fontSize: "1rem",
          fontWeight: 500,
          color: "#121212",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        Create four groups of four!
      </p>

      {/* Solved rows (appear above remaining tiles) */}
      {puzzle.groups
        .filter((g) => state.solved.includes(g.tier))
        .sort((a, b) => a.tier - b.tier)
        .map((g) => <SolvedRow key={g.tier} group={g} />)}

      {/* Tile grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          width: "100%",
          animation: shaking ? "gs-shake 0.5s ease" : undefined,
        }}
      >
        <style>{`
          @keyframes gs-shake {
            0%,100% { transform: translateX(0); }
            20%      { transform: translateX(-6px); }
            40%      { transform: translateX(6px); }
            60%      { transform: translateX(-4px); }
            80%      { transform: translateX(4px); }
          }
        `}</style>

        {state.words.map((word) => (
          <div
            key={word}
            style={tileStyle(word)}
            onClick={() => dispatch({ type: "TOGGLE", word })}
          >
            {word}
          </div>
        ))}
      </div>

      {/* One-away hint */}
      {oneAwayHint && (
        <div
          style={{
            fontFamily: NYT_FONT,
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "#92400e",
            background: "#fef9c3",
            border: "1px solid #fde047",
            padding: "0.45rem 0.9rem",
            borderRadius: "4px",
            textAlign: "center",
          }}
        >
          One away…
        </div>
      )}

      {/* Mistakes */}
      <MistakeDots />

      {/* Action row — pill buttons like NYT */}
      <div
        style={{
          display: "flex",
          gap: "0.65rem",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActionBtn onClick={() => dispatch({ type: "SHUFFLE" })}>Shuffle</ActionBtn>
        <ActionBtn onClick={() => dispatch({ type: "DESELECT_ALL" })} disabled={state.selected.size === 0}>
          Deselect all
        </ActionBtn>
        <ActionBtn onClick={handleSubmit} disabled={state.selected.size !== 4} primary>
          Submit
        </ActionBtn>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  disabled = false,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  const filled = primary && !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.55rem 1.15rem",
        borderRadius: "9999px",
        border: filled ? "1px solid #121212" : "1px solid #121212",
        background: filled ? "#121212" : "#ffffff",
        color: disabled ? "#a3a3a3" : filled ? "#ffffff" : "#121212",
        borderColor: disabled ? "#d4d4d4" : "#121212",
        fontFamily: NYT_FONT,
        fontSize: "0.875rem",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.12s ease, color 0.12s ease, border-color 0.12s ease",
      }}
    >
      {children}
    </button>
  );
}
