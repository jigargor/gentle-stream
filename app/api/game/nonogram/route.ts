/**
 * GET /api/game/nonogram?difficulty=easy|medium|hard
 *
 * Generates a fresh Nonogram puzzle server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateNonogram } from "@/lib/games/nonogramGenerator";
import type { Difficulty } from "@/lib/games/types";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export async function GET(request: NextRequest) {
  const diff = (request.nextUrl.searchParams.get("difficulty") ?? "medium") as Difficulty;
  const difficulty = VALID_DIFFICULTIES.includes(diff) ? diff : "medium";

  try {
    const puzzle = generateNonogram(difficulty);
    return NextResponse.json(puzzle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
