/**
 * GET /api/game/nonogram?difficulty=easy|medium|hard
 *
 * Generates a fresh Nonogram puzzle server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateNonogram } from "@/lib/games/nonogramGenerator";
import type { Difficulty } from "@/lib/games/types";
import { makeNonogramSignature } from "@/lib/games/puzzleSignature";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

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
      const puzzle = generateNonogram(difficulty);
      const uniquenessSignature = makeNonogramSignature(puzzle);
      if (!excludeSignatures.has(uniquenessSignature)) {
        return NextResponse.json({ ...puzzle, uniquenessSignature });
      }
    }
    return apiErrorResponse({
      request,
      status: 409,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "No unseen Nonogram puzzle available right now.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
