import { NextRequest, NextResponse } from "next/server";
import type { Difficulty } from "@gentle-stream/domain/games/types";
import { generateRabbitHole } from "@/lib/games/rabbitHoleGenerator";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

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
      .map((entry) => entry.trim())
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
    const seedBase =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "anonymous";
    for (let attempt = 0; attempt < 8; attempt++) {
      const puzzle = generateRabbitHole(difficulty, `${seedBase}:${attempt}`);
      if (!excludeSignatures.has(puzzle.uniquenessSignature ?? "")) {
        return NextResponse.json(puzzle, { headers: NO_STORE_HEADERS });
      }
    }
    return apiErrorResponse({
      request,
      status: 409,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "No unseen rabbit hole available right now.",
      headers: { ...NO_STORE_HEADERS },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Rabbit hole generation failed";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
      headers: { ...NO_STORE_HEADERS },
    });
  }
}
