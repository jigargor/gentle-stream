/**
 * GET /api/game/connections?daily=1
 *
 * Serves a Connections puzzle from the pre-generated pool (filtered by `games.flavor`
 * from `game_flavor_defaults`, not article categories).
 * Falls back to live generation if the pool is empty.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  getDailyConnectionsGameRow,
  getGameFromPool,
  getGameFromPoolUnseenThenReuse,
  markGameUsed,
} from "@/lib/db/games";
import { getPromptThemeForGameType } from "@/lib/db/gameFlavorDefaults";
import {
  runConnectionsIngest,
  type ConnectionsPuzzle,
} from "@/lib/games/connectionsIngestAgent";
import { ensureConnectionsIdentity } from "@/lib/games/connectionsUniqueness";
import type { Category } from "@/lib/constants";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

export const maxDuration = 60; // Vercel max for hobby plan

const CONNECTIONS_GENERATION_MIN_INTERVAL_MS = 20 * 60 * 1000;

function isLlmGameGenerationEnabled(): boolean {
  const raw = process.env.CRON_GAMES_LLM_ENABLED;
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function canTriggerConnectionsGeneration(): Promise<{
  allowed: boolean;
  retryAfterSeconds: number | null;
}> {
  const { data, error } = await db
    .from("game_generation_rate_limits")
    .select("last_generated_at")
    .eq("game_type", "connections")
    .maybeSingle();

  if (error) {
    // If rate-limit table isn't available yet, fail open to preserve gameplay.
    return { allowed: true, retryAfterSeconds: null };
  }

  const lastIso = (data as { last_generated_at?: string } | null)?.last_generated_at ?? null;
  if (!lastIso) return { allowed: true, retryAfterSeconds: null };

  const ageMs = Date.now() - Date.parse(lastIso);
  if (Number.isFinite(ageMs) && ageMs < CONNECTIONS_GENERATION_MIN_INTERVAL_MS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((CONNECTIONS_GENERATION_MIN_INTERVAL_MS - ageMs) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: null };
}

async function recordConnectionsGenerationTriggered(): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .from("game_generation_rate_limits")
    .upsert({ game_type: "connections", last_generated_at: nowIso }, { onConflict: "game_type" });
}

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
  const isDaily = searchParams.get("daily") === "1";
  const excludeSignatures = parseExcludeSignatures(
    searchParams.get("excludeSignatures")
  );
  const llmGameGenerationEnabled = isLlmGameGenerationEnabled();

  const utcDateKey = new Date().toISOString().slice(0, 10);

  // ── 0. Daily puzzle (NYT-style: same for everyone on a calendar day, UTC) ─
  if (isDaily) {
    try {
      const row = await getDailyConnectionsGameRow(utcDateKey);
      if (row) {
        void markGameUsed(row.id);
        const puzzle = ensureConnectionsIdentity(row.payload as ConnectionsPuzzle);
        return NextResponse.json({
          ...puzzle,
          fromPool: true,
          daily: true,
          dailyDate: utcDateKey,
        });
      }
    } catch (e) {
      console.warn("[/api/game/connections] Daily pool fetch failed:", e);
    }
    if (!llmGameGenerationEnabled) {
      return apiErrorResponse({
        request,
        status: 503,
        code: API_ERROR_CODES.BAD_GATEWAY,
        message: "Daily Connections pool is empty while generation is paused.",
      });
    }
    console.log(`[/api/game/connections] Daily mode — pool empty — generating live`);
  } else {
    // ── 1. Try pool (random / exclude-aware) ─────────────────────────────────
    try {
      const poolPick = await getGameFromPoolUnseenThenReuse("connections", undefined, {
        randomTieBreak: true,
        excludeSignatures,
      });
      const row = poolPick.row;
      if (row) {
        void markGameUsed(row.id);
        const puzzle = ensureConnectionsIdentity(row.payload as ConnectionsPuzzle);
        return NextResponse.json({
          ...puzzle,
          fromPool: true,
          ...(poolPick.reusedExcluded ? { reusedExcluded: true } : {}),
        });
      }
    } catch (e) {
      console.warn("[/api/game/connections] Pool fetch failed:", e);
    }

    if (!llmGameGenerationEnabled) {
      const status = excludeSignatures.length > 0 ? 409 : 503;
      return apiErrorResponse({
        request,
        status,
        code: status === 409 ? API_ERROR_CODES.NOT_FOUND : API_ERROR_CODES.BAD_GATEWAY,
        message:
          excludeSignatures.length > 0
            ? "No unseen Connections puzzle available right now."
            : "Connections pool is empty while generation is paused.",
      });
    }
  }

  // ── 2. Live generation fallback ─────────────────────────────────────────────
  console.log(`[/api/game/connections] Pool empty (or all excluded) — considering live generation`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const status = excludeSignatures.length > 0 ? 409 : 503;
    return apiErrorResponse({
      request,
      status,
      code: status === 409 ? API_ERROR_CODES.NOT_FOUND : API_ERROR_CODES.BAD_GATEWAY,
      message:
        excludeSignatures.length > 0
          ? "No unseen Connections puzzle available right now."
          : "Pool empty and ANTHROPIC_API_KEY not set",
    });
  }

  try {
    const gate = await canTriggerConnectionsGeneration();
    if (!gate.allowed) {
      return apiErrorResponse({
        request,
        status: 409,
        code: API_ERROR_CODES.RATE_LIMITED,
        message:
          excludeSignatures.length > 0
            ? "No unseen Connections puzzle available right now."
            : "Connections pool is empty right now.",
        retryAfterSec: gate.retryAfterSeconds ?? undefined,
        headers: gate.retryAfterSeconds
          ? { "Retry-After": String(gate.retryAfterSeconds) }
          : undefined,
      });
    }

    await recordConnectionsGenerationTriggered();
    const promptTheme = (await getPromptThemeForGameType(
      "connections"
    )) as Category;
    const inserted = await runConnectionsIngest(promptTheme);

    if (inserted === 0) {
      const status = excludeSignatures.length > 0 ? 409 : 500;
      return apiErrorResponse({
        request,
        status,
        code: status === 409 ? API_ERROR_CODES.NOT_FOUND : API_ERROR_CODES.INTERNAL,
        message:
          status === 409
            ? "No unseen Connections puzzle available right now."
            : "Generation failed — please try again",
      });
    }

    if (isDaily) {
      const row = await getDailyConnectionsGameRow(utcDateKey);
      if (row) {
        void markGameUsed(row.id);
        const puzzle = ensureConnectionsIdentity(row.payload as ConnectionsPuzzle);
        return NextResponse.json({
          ...puzzle,
          fromPool: false,
          daily: true,
          dailyDate: utcDateKey,
        });
      }
    }

    const row = await getGameFromPool("connections", undefined, {
      randomTieBreak: true,
      excludeSignatures: isDaily ? [] : excludeSignatures,
      allowExcludedFallback: false,
    });
    if (!row) {
      return apiErrorResponse({
        request,
        status: 409,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Generation succeeded but no unseen puzzle was available yet",
      });
    }

    void markGameUsed(row.id);
    const puzzle = ensureConnectionsIdentity(row.payload as ConnectionsPuzzle);
    return NextResponse.json({
      ...puzzle,
      fromPool: false,
      ...(isDaily ? { daily: true, dailyDate: utcDateKey } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    if (excludeSignatures.length > 0) {
      return apiErrorResponse({
        request,
        status: 409,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "No unseen Connections puzzle available right now.",
      });
    }
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
