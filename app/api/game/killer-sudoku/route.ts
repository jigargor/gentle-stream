/**
 * GET /api/game/killer-sudoku?difficulty=easy|medium|hard
 *
 * Generates a fresh Killer Sudoku puzzle server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateKillerSudoku } from "@/lib/games/killerSudokuGenerator";
import type { Difficulty } from "@/lib/games/types";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export async function GET(request: NextRequest) {
  const diff = (request.nextUrl.searchParams.get("difficulty") ?? "medium") as Difficulty;
  const difficulty = VALID_DIFFICULTIES.includes(diff) ? diff : "medium";

  try {
    const puzzle = generateKillerSudoku(difficulty);
    return NextResponse.json(puzzle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
