/**
 * GET /api/game/word-search?difficulty=easy|medium|hard&category=...
 *
 * Signed-in: prefers words from `game_word_pool` weighted by `user_word_search_exposure`.
 * Anonymous / fallback: static banks in `wordSearchStaticBanks.ts`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  buildWordSearchOptions,
  recordWordSearchExposure,
  selectWordsForUserPuzzle,
  seedGameWordPoolFromStaticIfEmpty,
} from "@/lib/db/gameWordPool";
import { generateWordSearch } from "@/lib/games/wordSearchGenerator";
import type { Difficulty } from "@/lib/games/types";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawDiff = searchParams.get("difficulty") ?? "medium";
  const category = searchParams.get("category") ?? undefined;

  const difficulty = VALID_DIFFICULTIES.includes(rawDiff as Difficulty)
    ? (rawDiff as Difficulty)
    : "medium";

  try {
    const userId = await getSessionUserId();

    if (userId) {
      try {
        await seedGameWordPoolFromStaticIfEmpty();
        const picked = await selectWordsForUserPuzzle(
          userId,
          difficulty,
          category
        );
        if (picked) {
          const puzzle = generateWordSearch(
            difficulty,
            buildWordSearchOptions(category, picked)
          );
          const placed = puzzle.words.map((p) => p.word);
          if (placed.length > 0) {
            await recordWordSearchExposure(userId, placed, category);
          }
          return NextResponse.json(puzzle);
        }
      } catch (e) {
        console.error("[word-search] pool path:", e);
      }
    }

    const puzzle = generateWordSearch(difficulty, category);
    return NextResponse.json(puzzle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
