/**
 * GET /api/game/crossword
 *
 * Serves a crossword puzzle. Tries the DB pool first, then builds a grid locally
 * and attaches clues via Wiktionary/Datamuse heuristics by default, or Claude when
 * CROSSWORD_CLUES_SOURCE=anthropic.
 *
 * Never returns a puzzle while any clue is still the mechanical "Definition needed"
 * placeholder — pool rows missing real clues are skipped; live generation retries
 * Claude once (anthropic mode), then errors if clues are still incomplete.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGameFromPool, getGameFromPoolUnseenThenReuse, markGameUsed } from "@/lib/db/games";
import { getPromptThemeForGameType } from "@/lib/db/gameFlavorDefaults";
import {
  allCrosswordSlotsHaveRealClues,
  buildCluePromptBlock,
  canonicalizeClueKeys,
  clueForSlot,
} from "@/lib/games/crosswordClueMerge";
import {
  fillCrosswordGrid,
  type CrosswordSlot,
} from "@/lib/games/crosswordGridFiller";
import type {
  CrosswordPuzzle,
  CrosswordSlot as TypedCrosswordSlot,
} from "@/lib/games/types";
import { makeCrosswordSignature } from "@/lib/games/puzzleSignature";
import {
  crosswordCluesPreferAnthropic,
  fetchCrosswordCluesHeuristic,
} from "@/lib/games/crosswordHeuristicClues";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

type SlotWithClue = CrosswordSlot & { clue: string };

function mechanicalClue(slot: CrosswordSlot): string {
  return `Definition needed (${slot.length} letters)`;
}

function slotsWithClues(
  slots: CrosswordSlot[],
  clueMap: Record<string, string>
): SlotWithClue[] {
  return slots.map((slot) => ({
    ...slot,
    clue: clueForSlot(slot, clueMap, mechanicalClue),
  }));
}

const MAX_POOL_ATTEMPTS = 10;

function isLlmGameGenerationEnabled(): boolean {
  const raw = process.env.CRON_GAMES_LLM_ENABLED;
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/** Validated pool payload — real clues only; signature matches grid+answers. */
function buildPoolResponse(puzzle: {
  grid: string[][];
  slots: TypedCrosswordSlot[];
  category: string;
  difficulty: "medium";
}): Record<string, unknown> {
  const trimmedSlots = puzzle.slots.map((s) => ({
    ...s,
    clue: s.clue.trim(),
  }));
  const normalizedPuzzle: CrosswordPuzzle = {
    ...puzzle,
    slots: trimmedSlots,
    uniquenessSignature: makeCrosswordSignature({
      ...puzzle,
      slots: trimmedSlots,
    }),
  };
  return {
    ...normalizedPuzzle,
    fromPool: true,
  };
}

function parseExcludeSignatures(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
}

async function fetchClueMapFromClaude(
  apiKey: string,
  category: string | undefined,
  slots: CrosswordSlot[]
): Promise<Record<string, string>> {
  const wordList = buildCluePromptBlock(slots);

  const prompt =
    `Write crossword clues for a "${category ?? "general knowledge"}" themed puzzle.\n` +
    `For each ENTRY below, write ONE short clue (5–10 words). Do not put the solution in the clue. No preamble.\n` +
    `Entries are numbered by grid label (e.g. 1-across and 1-down are different clues even when the answer word is the same).\n` +
    `Return ONLY JSON with keys exactly like "1-across", "1-down", "2-down", etc.:\n` +
    `{"1-across":"...","1-down":"...",...}\n\nEntries:\n${wordList}`;

  const model =
    process.env.ANTHROPIC_CROSSWORD_MODEL?.trim() ||
    "claude-sonnet-4-20250514";

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(
      `[/api/game/crossword] Claude HTTP ${res.status}:`,
      body.slice(0, 400)
    );
    return {};
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const strMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") strMap[k] = v;
      }
      return canonicalizeClueKeys(strMap);
    }
  } catch {
    console.warn(
      "[/api/game/crossword] Could not parse clues JSON:",
      text.slice(0, 200)
    );
  }
  return {};
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const themeForGeneration = await getPromptThemeForGameType("crossword");
  const categoryLabel = themeForGeneration;
  const excludeSignatures = parseExcludeSignatures(
    searchParams.get("excludeSignatures")
  );
  const llmGameGenerationEnabled = isLlmGameGenerationEnabled();

  const skipSignatures = new Set(excludeSignatures);

  try {
    for (let attempt = 0; attempt < MAX_POOL_ATTEMPTS; attempt++) {
      const row = await getGameFromPool("crossword", undefined, {
        randomTieBreak: true,
        excludeSignatures: Array.from(skipSignatures),
        allowExcludedFallback: false,
      });
      if (!row) break;

      const poolPuzzle = row.payload as {
        grid: string[][];
        slots: (CrosswordSlot & { clue?: string })[];
        category: string;
        difficulty: "medium";
      };

      if (
        !Array.isArray(poolPuzzle.grid) ||
        !Array.isArray(poolPuzzle.slots) ||
        poolPuzzle.slots.length === 0
      ) {
        void markGameUsed(row.id);
        continue;
      }

      const slotsWithStrings = poolPuzzle.slots.map((s) => ({
        ...s,
        clue: typeof s.clue === "string" ? s.clue : "",
      })) as TypedCrosswordSlot[];

      if (!allCrosswordSlotsHaveRealClues(slotsWithStrings)) {
        const sig = makeCrosswordSignature({
          grid: poolPuzzle.grid,
          slots: slotsWithStrings,
          category: poolPuzzle.category,
          difficulty: "medium",
        });
        console.warn(
          "[/api/game/crossword] Skipping pool row with incomplete/placeholder clues:",
          sig
        );
        skipSignatures.add(sig);
        continue;
      }

      void markGameUsed(row.id);
      return NextResponse.json(
        buildPoolResponse({
          grid: poolPuzzle.grid,
          slots: slotsWithStrings,
          category: poolPuzzle.category,
          difficulty: "medium",
        })
      );
    }
  } catch (e) {
    console.warn("[/api/game/crossword] Pool fetch failed:", e);
  }

  // Phase B: allow controlled reuse only after strict unseen was exhausted.
  try {
    const poolPick = await getGameFromPoolUnseenThenReuse("crossword", undefined, {
      randomTieBreak: true,
      excludeSignatures: Array.from(skipSignatures),
    });
    if (poolPick.row && poolPick.reusedExcluded) {
      const poolPuzzle = poolPick.row.payload as {
        grid: string[][];
        slots: (CrosswordSlot & { clue?: string })[];
        category: string;
        difficulty: "medium";
      };
      const slotsWithStrings = poolPuzzle.slots.map((s) => ({
        ...s,
        clue: typeof s.clue === "string" ? s.clue : "",
      })) as TypedCrosswordSlot[];
      if (allCrosswordSlotsHaveRealClues(slotsWithStrings)) {
        void markGameUsed(poolPick.row.id);
        return NextResponse.json({
          ...buildPoolResponse({
            grid: poolPuzzle.grid,
            slots: slotsWithStrings,
            category: poolPuzzle.category,
            difficulty: "medium",
          }),
          reusedExcluded: true,
        });
      }
    }
  } catch (e) {
    console.warn("[/api/game/crossword] Pool reuse fetch failed:", e);
  }

  if (!llmGameGenerationEnabled) {
    const status = excludeSignatures.length > 0 ? 409 : 503;
    return apiErrorResponse({
      request,
      status,
      code: status === 409 ? API_ERROR_CODES.NOT_FOUND : API_ERROR_CODES.BAD_GATEWAY,
      message:
        status === 409
          ? "No unseen Crossword puzzle available right now."
          : "Crossword pool is empty while generation is paused.",
    });
  }

  console.log(
    `[/api/game/crossword] Pool empty or no valid clues — live grid for "${themeForGeneration}"`
  );

  const filled = fillCrosswordGrid(themeForGeneration);
  if (!filled) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: "Grid generation failed",
    });
  }

  const { grid, slots } = filled;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  let clueMap: Record<string, string> = {};
  let merged: SlotWithClue[];

  if (crosswordCluesPreferAnthropic()) {
    if (!apiKey) {
      return apiErrorResponse({
        request,
        status: 503,
        code: API_ERROR_CODES.BAD_GATEWAY,
        message:
          "CROSSWORD_CLUES_SOURCE=anthropic requires ANTHROPIC_API_KEY to be set.",
      });
    }
    try {
      clueMap = await fetchClueMapFromClaude(apiKey, themeForGeneration, slots);
    } catch (e) {
      console.warn("[/api/game/crossword] Claude request error:", e);
    }
    merged = slotsWithClues(slots, clueMap);
    if (!allCrosswordSlotsHaveRealClues(merged)) {
      console.warn("[/api/game/crossword] Retrying clue generation once…");
      try {
        clueMap = await fetchClueMapFromClaude(apiKey, themeForGeneration, slots);
        merged = slotsWithClues(slots, clueMap);
      } catch (e) {
        console.warn("[/api/game/crossword] Claude retry error:", e);
      }
    }
  } else {
    try {
      clueMap = await fetchCrosswordCluesHeuristic(slots, categoryLabel);
    } catch (e) {
      console.warn("[/api/game/crossword] Heuristic clues failed:", e);
      return apiErrorResponse({
        request,
        status: 503,
        code: API_ERROR_CODES.BAD_GATEWAY,
        message:
          "Crossword clues could not be loaded — please try again in a moment.",
      });
    }
    merged = slotsWithClues(slots, clueMap);
  }

  if (!allCrosswordSlotsHaveRealClues(merged)) {
    return apiErrorResponse({
      request,
      status: 503,
      code: API_ERROR_CODES.BAD_GATEWAY,
      message:
        "Crossword clues are not ready yet — please try again in a moment.",
    });
  }

  const hadAiClues =
    crosswordCluesPreferAnthropic() && Object.keys(clueMap).length > 0;

  const puzzle: CrosswordPuzzle = {
    grid,
    slots: merged,
    category: categoryLabel,
    difficulty: "medium" as const,
    uniquenessSignature: "",
  };
  puzzle.uniquenessSignature = makeCrosswordSignature(puzzle);
  if (excludeSignatures.includes(puzzle.uniquenessSignature)) {
    return apiErrorResponse({
      request,
      status: 409,
      code: API_ERROR_CODES.NOT_FOUND,
      message: "No unseen Crossword puzzle available right now.",
    });
  }

  return NextResponse.json({
    ...puzzle,
    fromPool: false,
    cluesFromAi: hadAiClues,
  });
}
