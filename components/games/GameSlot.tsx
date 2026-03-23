"use client";

import { useCallback, useEffect, useState } from "react";
import SudokuCard from "./SudokuCard";
import WordSearchCard from "./WordSearchCard";
import type { SudokuPuzzle, WordSearchPuzzle, Difficulty, GameType } from "@/lib/games/types";

interface GameSlotProps {
  gameType: GameType;
  difficulty?: Difficulty;
  /** Article category of the surrounding feed section — used for word bank theming */
  category?: string;
}

type AnyPuzzle = SudokuPuzzle | WordSearchPuzzle;

function puzzleEndpoint(gameType: GameType, difficulty: Difficulty, category?: string): string {
  const params = new URLSearchParams({ difficulty });
  if (category) params.set("category", category);
  if (gameType === "sudoku") return `/api/game/sudoku?${params}`;
  if (gameType === "word_search") return `/api/game/word-search?${params}`;
  return `/api/game/sudoku?${params}`; // fallback
}

export default function GameSlot({
  gameType,
  difficulty = "medium",
  category,
}: GameSlotProps) {
  const [puzzle, setPuzzle] = useState<AnyPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>(difficulty);

  const fetchPuzzle = useCallback(async (diff: Difficulty) => {
    const isInitialLoad = puzzle === null;
    if (isInitialLoad) setLoading(true);
    setError(null);
    try {
      const url = puzzleEndpoint(gameType, diff, category);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPuzzle(data);
      setCurrentDifficulty(diff);
    } catch {
      setError("Could not load puzzle — try again.");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  }, [gameType, category, puzzle]);

  useEffect(() => {
    fetchPuzzle(currentDifficulty);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewPuzzle = useCallback(
    (diff: Difficulty) => fetchPuzzle(diff),
    [fetchPuzzle]
  );

  // Full-height placeholder only on first load — swapping difficulty keeps the card
  // mounted so the feed layout (and scroll position) does not jump.
  if (loading && puzzle === null) {
    return (
      <div style={{
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#faf8f3",
        padding: "3rem",
        textAlign: "center",
        fontFamily: "'IM Fell English', Georgia, serif",
        fontStyle: "italic",
        color: "#bbb",
        fontSize: "0.88rem",
      }}>
        Setting the puzzle&hellip;
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div style={{
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#faf8f3",
        padding: "2rem",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#8b4513",
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}>
          {error ?? "Puzzle unavailable."}
        </p>
        <button
          onClick={() => fetchPuzzle(currentDifficulty)}
          style={{
            background: "#1a1a1a",
            color: "#faf8f3",
            border: "none",
            padding: "0.4rem 1.2rem",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.75rem",
            letterSpacing: "0.06em",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (gameType === "sudoku") {
    return <SudokuCard puzzle={puzzle as SudokuPuzzle} onNewPuzzle={handleNewPuzzle} />;
  }

  if (gameType === "word_search") {
    return <WordSearchCard puzzle={puzzle as WordSearchPuzzle} onNewPuzzle={handleNewPuzzle} />;
  }

  return null;
}
