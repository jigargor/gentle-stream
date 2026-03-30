"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SudokuCard, { type SudokuCloudSlice } from "./SudokuCard";
import KillerSudokuCard from "./KillerSudokuCard";
import WordSearchCard, { type WordSearchCloudSlice } from "./WordSearchCard";
import NonogramCard from "./NonogramCard";
import CrosswordCard from "./CrosswordCard";
import ConnectionsCard from "./ConnectionsCard";
import type {
  SudokuPuzzle,
  KillerSudokuPuzzle,
  WordSearchPuzzle,
  NonogramPuzzle,
  CrosswordPuzzle,
  ConnectionsPuzzle,
  Difficulty,
  GameType,
} from "@/lib/games/types";

interface GameSlotProps {
  gameType: GameType;
  difficulty?: Difficulty;
  /** Softer frame when embedded in an article card */
  embedded?: boolean;
  /** Load/save in-progress games to the signed-in user (off for hero embeds). */
  persistCloud?: boolean;
  /** NYT-style daily Connections — same puzzle for everyone; no replay / exclude churn */
  connectionsDaily?: boolean;
}

type AnyPuzzle = SudokuPuzzle | KillerSudokuPuzzle | WordSearchPuzzle | NonogramPuzzle | CrosswordPuzzle | ConnectionsPuzzle;
type PuzzleWithUniqueness = AnyPuzzle & {
  uniquenessSignature?: string;
  puzzleId?: string;
};

const RECENT_SIGNATURE_LIMIT = 12;

/** Preload must not block on user APIs — slow/hanging auth or DB would leave "Setting the grid…" forever. */
const USER_PREFS_FETCH_TIMEOUT_MS = 8_000;
const PUZZLE_FETCH_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const tid = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(tid);
  }
}

function signatureStorageKey(gameType: GameType): string {
  return `gentle_stream_recent_puzzle_signatures_${gameType}`;
}

function readRecentSignatures(gameType: GameType): string[] {
  try {
    const raw = localStorage.getItem(signatureStorageKey(gameType));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === "string").slice(-RECENT_SIGNATURE_LIMIT);
  } catch {
    return [];
  }
}

function writeRecentSignature(
  gameType: GameType,
  signature?: string,
  puzzleId?: string
): void {
  const token = signature ?? puzzleId;
  if (!token) return;
  const prev = readRecentSignatures(gameType).filter((s) => s !== token);
  const next = [...prev, token].slice(-RECENT_SIGNATURE_LIMIT);
  try {
    localStorage.setItem(signatureStorageKey(gameType), JSON.stringify(next));
  } catch {
    // ignore quota / private mode issues
  }
}

function puzzleEndpoint(
  gameType: GameType,
  diff: Difficulty,
  excludeSignatures?: string[],
  connectionsDaily?: boolean
): string {
  const params = new URLSearchParams({ difficulty: diff });
  if (gameType === "connections" && connectionsDaily) {
    params.set("daily", "1");
  } else if (excludeSignatures && excludeSignatures.length > 0) {
    params.set("excludeSignatures", excludeSignatures.join(","));
  }
  if (gameType === "sudoku")        return `/api/game/sudoku?${params}`;
  if (gameType === "killer_sudoku")  return `/api/game/killer-sudoku?${params}`;
  if (gameType === "word_search")    return `/api/game/word-search?${params}`;
  if (gameType === "nonogram")       return `/api/game/nonogram?${params}`;
  if (gameType === "crossword")      return `/api/game/crossword?${params}`;
  if (gameType === "connections")    return `/api/game/connections?${params}`;
  return `/api/game/sudoku?${params}`;
}

const LOADING_MESSAGES: Partial<Record<GameType, string>> = {
  sudoku:        "Setting the grid…",
  killer_sudoku: "Counting the cages…",
  word_search:   "Hiding the words…",
  nonogram:      "Composing the picture…",
  crossword:     "Setting the clues…",
  connections:   "Building the groups…",
};

export default function GameSlot({
  gameType,
  difficulty = "medium",
  embedded = false,
  persistCloud = true,
  connectionsDaily = false,
}: GameSlotProps) {
  const [puzzle, setPuzzle] = useState<AnyPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDifficulty, setCurrentDifficulty] =
    useState<Difficulty>(difficulty);
  const [sudokuCloud, setSudokuCloud] = useState<SudokuCloudSlice | null>(null);
  const [wordCloud, setWordCloud] = useState<WordSearchCloudSlice | null>(null);
  /** Server completion signatures — ref only so bootstrap does not re-run when this updates (avoids fetch loops). */
  const completedSignaturesRef = useRef<string[]>([]);
  const [hasNoUniqueAvailable, setHasNoUniqueAvailable] = useState(false);

  const buildExcludeSignatures = useCallback(
    (allowReplay: boolean): string[] => {
      if (allowReplay) return [];
      if (gameType === "connections" && connectionsDaily) return [];
      const recent = readRecentSignatures(gameType);
      return Array.from(
        new Set([...completedSignaturesRef.current, ...recent])
      ).slice(-200);
    },
    [gameType, connectionsDaily]
  );

  const fetchPuzzleFromApi = useCallback(
    async (diff: Difficulty, allowReplay = false) => {
      setError(null);
      setHasNoUniqueAvailable(false);
      setSudokuCloud(null);
      setWordCloud(null);
      try {
        const excludeSignatures = buildExcludeSignatures(allowReplay);
        const url = puzzleEndpoint(
          gameType,
          diff,
          excludeSignatures,
          connectionsDaily
        );
        const res = await fetchWithTimeout(
          url,
          { cache: "no-store" },
          PUZZLE_FETCH_TIMEOUT_MS
        );
        if (res.status === 409 && !allowReplay) {
          setHasNoUniqueAvailable(true);
          setPuzzle(null);
          setError("0 unique games available right now.");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PuzzleWithUniqueness;
        setPuzzle(data);
        writeRecentSignature(gameType, data.uniquenessSignature, data.puzzleId);
        setCurrentDifficulty(diff);
      } catch {
        setError("Could not load puzzle — try again.");
      }
    },
    [gameType, buildExcludeSignatures, connectionsDaily]
  );

  useEffect(() => {
    let cancelled = false;

    // Feed rows keep stable keys like `game-0` across category changes, so React reuses
    // this instance. Clear puzzle immediately so we never render the previous game's
    // shape as the new type (e.g. word search → nonogram) while fetch is in flight.
    setPuzzle(null);
    setError(null);
    setHasNoUniqueAvailable(false);
    setSudokuCloud(null);
    setWordCloud(null);
    setLoading(true);

    async function bootstrap() {
      const useCloud = persistCloud && !embedded;
      // Embedded hero/sidebar games: skip user APIs — they blocked puzzle load and only
      // matter for exclude list (localStorage recent sigs still apply via buildExcludeSignatures).
      if (!embedded) {
        try {
          const sigRes = await fetchWithTimeout(
            `/api/user/game-completion?gameType=${gameType}`,
            { credentials: "include" },
            USER_PREFS_FETCH_TIMEOUT_MS
          );
          if (sigRes.ok && !cancelled) {
            const body = (await sigRes.json()) as { signatures?: unknown };
            const signatures = Array.isArray(body?.signatures)
              ? body.signatures.filter((s): s is string => typeof s === "string")
              : [];
            completedSignaturesRef.current = signatures;
          }
        } catch {
          // anonymous / timeout / network: continue with local recent signatures only
        }
      }

      if (useCloud && (gameType === "sudoku" || gameType === "word_search")) {
        try {
          const res = await fetchWithTimeout(
            `/api/user/game-save?gameType=${gameType}`,
            { credentials: "include" },
            USER_PREFS_FETCH_TIMEOUT_MS
          );
          if (res.ok) {
            const row = await res.json();
            if (
              row?.game_state &&
              typeof row.game_state === "object" &&
              row.game_state !== null &&
              !cancelled
            ) {
              const gs = row.game_state as Record<string, unknown>;
              const p = gs.puzzle as AnyPuzzle | undefined;
              if (p) {
                setPuzzle(p);
                setCurrentDifficulty(
                  (row.difficulty as Difficulty) ?? difficulty
                );
                if (gameType === "sudoku" && gs.sudoku) {
                  setSudokuCloud(gs.sudoku as SudokuCloudSlice);
                }
                if (gameType === "word_search" && gs.wordSearch) {
                  setWordCloud(gs.wordSearch as WordSearchCloudSlice);
                }
                setLoading(false);
                return;
              }
            }
          }
        } catch {
          /* continue to API */
        }
      }

      if (cancelled) return;
      try {
        const url = puzzleEndpoint(
          gameType,
          difficulty,
          buildExcludeSignatures(false),
          connectionsDaily
        );
        const res = await fetchWithTimeout(
          url,
          { cache: "no-store" },
          PUZZLE_FETCH_TIMEOUT_MS
        );
        if (res.status === 409) {
          if (!cancelled) {
            setHasNoUniqueAvailable(true);
            setError("0 unique games available right now.");
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PuzzleWithUniqueness;
        if (!cancelled) {
          setPuzzle(data);
          writeRecentSignature(gameType, data.uniquenessSignature, data.puzzleId);
          setSudokuCloud(null);
          setWordCloud(null);
          setCurrentDifficulty(difficulty);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load puzzle — try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    gameType,
    difficulty,
    persistCloud,
    embedded,
    buildExcludeSignatures,
    connectionsDaily,
  ]);

  const handleNewPuzzle = useCallback(
    async (diff: Difficulty) => {
      setLoading(true);
      setError(null);
      await fetchPuzzleFromApi(diff, false);
      setLoading(false);
    },
    [fetchPuzzleFromApi]
  );

  const cloudOn = persistCloud && !embedded;

  if (loading && puzzle === null) {
    return (
      <div
        style={{
          borderTop: "3px double #1a1a1a",
          borderBottom: "2px solid #1a1a1a",
          background: "#faf8f3",
          padding: "3rem",
          textAlign: "center",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#bbb",
          fontSize: "0.88rem",
        }}
      >
        {LOADING_MESSAGES[gameType] ?? "Setting the puzzle…"}
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div
        style={{
          borderTop: "3px double #1a1a1a",
          borderBottom: "2px solid #1a1a1a",
          background: "#faf8f3",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            color: "#8b4513",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          {error ?? "Puzzle unavailable."}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void fetchPuzzleFromApi(currentDifficulty, false)}
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
            Check again
          </button>
          {hasNoUniqueAvailable ? (
            <button
              type="button"
              onClick={() => void fetchPuzzleFromApi(currentDifficulty, true)}
              style={{
                background: "transparent",
                color: "#1a1a1a",
                border: "1px solid #1a1a1a",
                padding: "0.4rem 1.2rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.75rem",
                letterSpacing: "0.06em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              Replay older puzzle
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  /** Always record completions for signed-in users; API returns 401 if anonymous.
   *  (Previously `!embedded` skipped hero puzzles — those never reached game stats.) */
  const metricsOn = true;
  const puzzleSignature =
    ("uniquenessSignature" in puzzle && typeof puzzle.uniquenessSignature === "string"
      ? puzzle.uniquenessSignature
      : undefined) ??
    ("puzzleId" in puzzle && typeof puzzle.puzzleId === "string"
      ? puzzle.puzzleId
      : undefined);

  if (gameType === "sudoku") {
    return (
      <SudokuCard
        puzzle={puzzle as SudokuPuzzle}
        onNewPuzzle={handleNewPuzzle}
        embedded={embedded}
        initialCloudSlice={sudokuCloud}
        cloudSaveEnabled={cloudOn}
        metricsEnabled={metricsOn}
        puzzleSignature={puzzleSignature}
      />
    );
  }

  if (gameType === "word_search") {
    return (
      <WordSearchCard
        puzzle={puzzle as WordSearchPuzzle}
        onNewPuzzle={handleNewPuzzle}
        initialCloudSlice={wordCloud}
        cloudSaveEnabled={cloudOn}
        metricsEnabled={metricsOn}
        puzzleSignature={puzzleSignature}
      />
    );
  }

  if (gameType === "killer_sudoku") {
    return (
      <KillerSudokuCard
        puzzle={puzzle as KillerSudokuPuzzle}
        onNewPuzzle={handleNewPuzzle}
        metricsEnabled={metricsOn}
        puzzleSignature={puzzleSignature}
      />
    );
  }

  if (gameType === "nonogram") {
    return (
      <NonogramCard
        puzzle={puzzle as NonogramPuzzle}
        onNewPuzzle={handleNewPuzzle}
        metricsEnabled={metricsOn}
        puzzleSignature={puzzleSignature}
      />
    );
  }

  if (gameType === "crossword") {
    return (
      <CrosswordCard
        puzzle={puzzle as CrosswordPuzzle}
        onNewPuzzle={handleNewPuzzle}
        metricsEnabled={metricsOn}
        puzzleSignature={puzzleSignature}
      />
    );
  }

  if (gameType === "connections") {
    return (
      <ConnectionsCard
        puzzle={puzzle as ConnectionsPuzzle}
        onNewPuzzle={connectionsDaily ? undefined : handleNewPuzzle}
        metricsEnabled={metricsOn}
        puzzleSignature={puzzleSignature}
        dailyPuzzle={connectionsDaily}
      />
    );
  }

  return null;
}
