/**
 * GET /api/game/sudoku?difficulty=easy|medium|hard
 *
 * Generates a fresh Sudoku puzzle server-side and returns it as JSON.
 * No DB read — pure algorithmic generation (~1–5ms).
 * The solution is included in the response (validated client-side on completion).
 */

import { NextRequest, NextResponse } from "next/server";
import { generateSudoku } from "../../../../lib/games/sudokuGenerator";
import type { Difficulty } from "../../../../lib/games/types";
import { makeSudokuSignature } from "@/lib/games/puzzleSignature";

export const dynamic = "force-dynamic";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

function parseExcludeSignatures(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200)
  );
}

export async function GET(request: NextRequest) {
  const diff = (request.nextUrl.searchParams.get("difficulty") ?? "medium") as Difficulty;
  const difficulty = VALID_DIFFICULTIES.includes(diff) ? diff : "medium";
  const excludeSignatures = parseExcludeSignatures(
    request.nextUrl.searchParams.get("excludeSignatures")
  );

  try {
    for (let i = 0; i < 20; i++) {
      const puzzle = generateSudoku(difficulty);
      const uniquenessSignature = makeSudokuSignature(puzzle);
      if (!excludeSignatures.has(uniquenessSignature)) {
        return NextResponse.json(
          { ...puzzle, uniquenessSignature },
          { headers: NO_STORE_HEADERS }
        );
      }
    }
    return NextResponse.json(
      { error: "No unseen Sudoku puzzle available right now." },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
