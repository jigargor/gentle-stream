"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ConnectionsPuzzle, ConnectionsGroup, ConnectionsTier } from "@/lib/games/connectionsIngestAgent";
import type { Difficulty } from "@/lib/games/types";

// ─── Tier colours ─────────────────────────────────────────────────────────────
// Using the app's warm palette — newsprint tones rather than NYT's primaries

const TIER_STYLES: Record<ConnectionsTier, { bg: string; text: string; label: string }> = {
  1: { bg: "#d4c27a", text: "#2c2000", label: "Straightforward" },   // warm yellow
  2: { bg: "#8fb87a", text: "#0d2200", label: "Moderate"        },   // sage green
  3: { bg: "#7a9eb8", text: "#001828", label: "Tricky"          },   // dusty blue
  4: { bg: "#9b7ab8", text: "#1a0028", label: "Devious"         },   // muted purple
};

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
}: ConnectionsCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;
  const completionLogged = useRef(false);

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
  }, [puzzle, dispatch]);

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
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    background: "#faf8f3",
    padding: "1.5rem 1.5rem 1.2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.875rem",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  const TILE_W = "calc(25% - 6px)";

  function tileStyle(word: string): React.CSSProperties {
    const isSelected = state.selected.has(word);
    const group = getGroupForWord(puzzle, word);
    const isSolved = group && state.solved.includes(group.tier);

    return {
      width: TILE_W,
      aspectRatio: "1.9 / 1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: isSelected ? "#1a1a1a" : "#ede9e1",
      color: isSelected ? "#faf8f3" : "#1a1a1a",
      fontFamily: "'Playfair Display', Georgia, serif",
      fontSize: "clamp(0.65rem, 1.6vw, 0.88rem)",
      fontWeight: 700,
      letterSpacing: "0.04em",
      cursor: "pointer",
      borderRadius: 6,
      transition: "background 0.12s ease, transform 0.08s ease",
      transform: isSelected ? "scale(0.96)" : "scale(1)",
      WebkitTapHighlightColor: "transparent",
    };
  }

  // ── Mistakes indicator ───────────────────────────────────────────────────────
  const MistakeDots = () => (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.75rem", color: "#888" }}>
        Mistakes remaining:
      </span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{
          width: 12, height: 12, borderRadius: "50%",
          background: i < state.mistakesLeft ? "#1a1a1a" : "#ddd",
          transition: "background 0.3s ease",
        }} />
      ))}
    </div>
  );

  // ── Solved group row ─────────────────────────────────────────────────────────
  const SolvedRow = ({ group }: { group: ConnectionsGroup }) => {
    const style = TIER_STYLES[group.tier];
    return (
      <div style={{
        width: "100%",
        padding: "0.6rem 1rem",
        background: style.bg,
        borderRadius: 6,
        textAlign: "center",
      }}>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "0.82rem",
          fontWeight: 700,
          color: style.text,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}>
          {group.label}
        </div>
        <div style={{
          fontFamily: "Georgia, serif",
          fontSize: "0.72rem",
          color: style.text,
          opacity: 0.8,
          marginTop: 2,
        }}>
          {group.words.join("  ·  ")}
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
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
            Connections
          </span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.category}
          </span>
        </div>

        {/* All groups revealed */}
        {puzzle.groups.map((g) => <SolvedRow key={g.tier} group={g} />)}

        {/* Result */}
        <div style={{ textAlign: "center", padding: "0.5rem 0", fontFamily: "'Playfair Display', Georgia, serif" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0d0d0d" }}>
            {won ? "Puzzle solved" : "Better luck next time"}
          </div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", fontSize: "0.85rem", marginTop: 2 }}>
            {won
              ? `Completed in ${formatTime(state.elapsedSecs)} with ${4 - state.mistakesLeft} mistake${4 - state.mistakesLeft === 1 ? "" : "s"}`
              : `${state.solved.length} of 4 groups found`}
          </div>
        </div>

        {/* Red herrings reveal */}
        {puzzle.redHerrings.length > 0 && (
          <div style={{ width: "100%" }}>
            <button
              onClick={() => setShowReveal(v => !v)}
              style={{
                width: "100%", padding: "0.4rem",
                background: "transparent",
                border: "1px solid #ccc",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem", letterSpacing: "0.06em",
                textTransform: "uppercase", cursor: "pointer", color: "#888",
              }}
            >
              {showReveal ? "Hide" : "Show"} the traps
            </button>
            {showReveal && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: 4 }}>
                {puzzle.redHerrings.map((rh) => (
                  <div key={rh.word} style={{
                    padding: "0.3rem 0.6rem",
                    background: "#ede9e1",
                    borderRadius: 4,
                    fontFamily: "Georgia, serif",
                    fontSize: "0.75rem",
                    color: "#555",
                  }}>
                    <strong style={{ color: "#1a1a1a" }}>{rh.word}</strong>
                    {" — could also seem like: "}{rh.couldAlsoBelong}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {onNewPuzzle && (
          <button onClick={() => onNewPuzzle("medium")} style={{
            padding: "0.4rem 1.2rem",
            border: "1px solid #1a1a1a",
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

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
          Connections
        </span>
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem" }}>
          <span>{puzzle.category}</span>
          {state.startedAt && (
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(state.elapsedSecs)}</span>
          )}
        </span>
      </div>

      {/* Instruction */}
      <p style={{ margin: 0, fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", alignSelf: "flex-start" }}>
        Find four groups of four — select four words, then submit
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
        <div style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          fontSize: "0.8rem",
          color: "#7a4400",
          background: "#fdf6e3",
          border: "1px solid #e8d9a0",
          padding: "0.3rem 0.8rem",
          borderRadius: 4,
        }}>
          One away…
        </div>
      )}

      {/* Mistakes */}
      <MistakeDots />

      {/* Action row */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <ActionBtn onClick={() => dispatch({ type: "SHUFFLE" })}>Shuffle</ActionBtn>
        <ActionBtn onClick={() => dispatch({ type: "DESELECT_ALL" })} disabled={state.selected.size === 0}>
          Deselect all
        </ActionBtn>
        <ActionBtn
          onClick={handleSubmit}
          disabled={state.selected.size !== 4}
          primary
        >
          Submit
        </ActionBtn>
      </div>

      {/* Tier legend */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
        {([1, 2, 3, 4] as ConnectionsTier[]).map((tier) => {
          const s = TIER_STYLES[tier];
          const solved = state.solved.includes(tier);
          return (
            <div key={tier} style={{
              padding: "0.15rem 0.5rem",
              borderRadius: 3,
              background: solved ? s.bg : "#ede9e1",
              fontFamily: "Georgia, serif",
              fontSize: "0.65rem",
              color: solved ? s.text : "#aaa",
              transition: "all 0.3s ease",
            }}>
              {s.label}
            </div>
          );
        })}
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
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.35rem 1rem",
        border: "1px solid #1a1a1a",
        background: primary && !disabled ? "#1a1a1a" : "transparent",
        color: disabled ? "#ccc" : primary ? "#faf8f3" : "#1a1a1a",
        borderColor: disabled ? "#ddd" : "#1a1a1a",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "0.72rem",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.12s ease",
      }}
    >
      {children}
    </button>
  );
}
