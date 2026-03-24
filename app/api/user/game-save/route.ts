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

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameType = request.nextUrl.searchParams.get("gameType");
  if (!gameType || !GAME_TYPES.has(gameType)) {
    return NextResponse.json({ error: "Invalid gameType" }, { status: 400 });
  }

  const { data, error } = await db
    .from("game_saves")
    .select("*")
    .eq("user_id", userId)
    .eq("game_type", gameType)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    gameType?: unknown;
    difficulty?: unknown;
    elapsedSeconds?: unknown;
    gameState?: unknown;
  };

  if (
    typeof body.gameType !== "string" ||
    !GAME_TYPES.has(body.gameType) ||
    typeof body.difficulty !== "string" ||
    !DIFFS.has(body.difficulty)
  ) {
    return NextResponse.json({ error: "Invalid gameType or difficulty" }, { status: 400 });
  }

  const elapsed =
    typeof body.elapsedSeconds === "number" && body.elapsedSeconds >= 0
      ? Math.floor(body.elapsedSeconds)
      : 0;

  if (body.gameState === undefined || typeof body.gameState !== "object" || body.gameState === null) {
    return NextResponse.json({ error: "gameState must be an object" }, { status: 400 });
  }

  const { error } = await db.from("game_saves").upsert(
    {
      user_id: userId,
      game_type: body.gameType,
      difficulty: body.difficulty,
      elapsed_seconds: elapsed,
      game_state: body.gameState as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,game_type" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gameType = request.nextUrl.searchParams.get("gameType");
  if (!gameType || !GAME_TYPES.has(gameType)) {
    return NextResponse.json({ error: "Invalid gameType" }, { status: 400 });
  }

  const { error } = await db
    .from("game_saves")
    .delete()
    .eq("user_id", userId)
    .eq("game_type", gameType);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
