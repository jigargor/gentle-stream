import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";

const GAME_TYPES = new Set([
  "sudoku",
  "word_search",
  "killer_sudoku",
  "nonogram",
]);
const DIFFS = new Set(["easy", "medium", "hard"]);

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    gameType?: unknown;
    difficulty?: unknown;
    durationSeconds?: unknown;
    score?: unknown;
    metadata?: unknown;
  };

  if (
    typeof body.gameType !== "string" ||
    !GAME_TYPES.has(body.gameType) ||
    typeof body.difficulty !== "string" ||
    !DIFFS.has(body.difficulty)
  ) {
    return NextResponse.json({ error: "Invalid gameType or difficulty" }, { status: 400 });
  }

  if (
    typeof body.durationSeconds !== "number" ||
    body.durationSeconds < 0 ||
    !Number.isFinite(body.durationSeconds)
  ) {
    return NextResponse.json({ error: "Invalid durationSeconds" }, { status: 400 });
  }

  const metadata =
    body.metadata !== undefined && typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : {};

  const score =
    typeof body.score === "number" && Number.isFinite(body.score) ? body.score : null;

  const { error } = await db.from("game_completions").insert({
    user_id: userId,
    game_type: body.gameType,
    difficulty: body.difficulty,
    duration_seconds: Math.floor(body.durationSeconds),
    score,
    metadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await db
    .from("game_saves")
    .delete()
    .eq("user_id", userId)
    .eq("game_type", body.gameType);

  return NextResponse.json({ ok: true });
}
