import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { parseJsonBody, parseQuery } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const GAME_TYPES = new Set([
  "sudoku",
  "word_search",
  "killer_sudoku",
  "nonogram",
  "crossword",
  "connections",
  "rabbit_hole",
]);
const DIFFS = new Set(["easy", "medium", "hard"]);
const gameTypeEnum = z.enum([
  "sudoku",
  "word_search",
  "killer_sudoku",
  "nonogram",
  "crossword",
  "connections",
  "rabbit_hole",
]);
const difficultyEnum = z.enum(["easy", "medium", "hard"]);
const getQuerySchema = z.object({
  gameType: gameTypeEnum.optional(),
});
const postBodySchema = z.object({
  gameType: gameTypeEnum,
  difficulty: difficultyEnum,
  durationSeconds: z.number().finite().min(0),
  score: z.number().finite().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const parsedQuery = parseQuery({
    request,
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    schema: getQuerySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const gameType = parsedQuery.data.gameType ?? null;

  let query = db
    .from("game_completions")
    .select("game_type,metadata")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(800);

  if (gameType) query = query.eq("game_type", gameType);

  const { data, error } = await query;
  if (error) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: error.message,
    });
  }

  const seen = new Set<string>();
  const signatures: string[] = [];
  for (const row of data ?? []) {
    const metadata =
      row && typeof row === "object"
        ? (row as { metadata?: unknown }).metadata
        : null;
    if (!metadata || typeof metadata !== "object") continue;
    const signature = (metadata as Record<string, unknown>).puzzleSignature;
    if (typeof signature !== "string") continue;
    const token = signature.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    signatures.push(token);
    if (signatures.length >= 500) break;
  }

  return NextResponse.json({ signatures });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: postBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const metadata = body.metadata ?? {};

  const score =
    typeof body.score === "number" && Number.isFinite(body.score) ? body.score : null;

  const { error: insertError } = await db.from("game_completions").insert({
    user_id: userId,
    game_type: body.gameType,
    difficulty: body.difficulty,
    duration_seconds: Math.floor(body.durationSeconds),
    score,
    metadata,
  });

  if (insertError) {
    console.error("[game-completion] insert failed:", insertError.message, insertError);
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: insertError.message,
    });
  }

  const { error: deleteError } = await db
    .from("game_saves")
    .delete()
    .eq("user_id", userId)
    .eq("game_type", body.gameType);

  if (deleteError) {
    console.error("[game-completion] game_saves delete failed:", deleteError.message);
    // Completion already recorded — don't fail the client
  }

  return NextResponse.json({ ok: true });
}
