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
  makeWordSearchSignature,
  recordWordSearchExposure,
  selectWordsForUserPuzzle,
  seedGameWordPoolFromStaticIfEmpty,
} from "@/lib/db/gameWordPool";
import { generateWordSearch } from "@/lib/games/wordSearchGenerator";
import type { Difficulty } from "@/lib/games/types";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function parseExcludeSignatures(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawDiff = searchParams.get("difficulty") ?? "medium";
  const category = searchParams.get("category") ?? undefined;
  const excludeSignatures = parseExcludeSignatures(
    searchParams.get("excludeSignatures")
  );

  const difficulty = VALID_DIFFICULTIES.includes(rawDiff as Difficulty)
    ? (rawDiff as Difficulty)
    : "medium";

  try {
    const userId = await getSessionUserId();

    if (userId) {
      try {
        await seedGameWordPoolFromStaticIfEmpty();
        const avoid = new Set<string>(excludeSignatures);
        let puzzle = generateWordSearch(difficulty, category);
        let picked: string[] | null = null;

        for (let i = 0; i < 4; i++) {
          picked = await selectWordsForUserPuzzle(userId, difficulty, category, {
            avoidSignatures: [...avoid],
          });
          if (!picked) break;

          const candidate = generateWordSearch(
            difficulty,
            buildWordSearchOptions(category, picked)
          );
          const sig = makeWordSearchSignature(
            candidate.words.map((p) => p.word)
          );
          if (!avoid.has(sig) || i === 3) {
            puzzle = { ...candidate, uniquenessSignature: sig };
            break;
          }
          avoid.add(sig);
        }

        if (picked) {
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

    let puzzle = generateWordSearch(difficulty, category);
    const avoid = new Set<string>(excludeSignatures);
    for (let i = 0; i < 4; i++) {
      const sig = makeWordSearchSignature(puzzle.words.map((p) => p.word));
      if (!avoid.has(sig) || i === 3) {
        puzzle = { ...puzzle, uniquenessSignature: sig };
        break;
      }
      avoid.add(sig);
      puzzle = generateWordSearch(difficulty, category);
    }
    return NextResponse.json(puzzle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
