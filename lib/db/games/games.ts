/**
 * lib/db/games/games.ts
 *
 * Database helpers for the games table.
 * Used by game ingest agents (write) and game API routes (read).
 *
 * Pool rows are filtered by `games.flavor` (see `game_flavor_defaults`), not article categories.
 */

import { db } from "../client";
import { resolveGameFlavor } from "@/lib/db/gameFlavorDefaults";
import type { CrosswordPuzzle } from "@/lib/games/crosswordIngestAgent";
import type { ConnectionsPuzzle } from "@/lib/games/connectionsIngestAgent";
import { makeConnectionsPuzzleId } from "@/lib/games/connectionsUniqueness";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  type: string;
  difficulty: string;
  /** @deprecated Legacy; pool uses `flavor` */
  category: string | null;
  flavor: string;
  payload: unknown;
  used_count: number;
  created_at: string;
}

function hashStringToUint32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Same calendar day (UTC) → same puzzle for everyone, NYT-style.
 * Picks a stable row from the pool using the date as seed (no per-user excludes).
 */
export async function getDailyConnectionsGameRow(
  utcDateKey: string,
  flavorOverride?: string | null
): Promise<GameRow | null> {
  const flavor = await resolveGameFlavor("connections", flavorOverride);

  const query = db
    .from("games")
    .select("*")
    .eq("type", "connections")
    .eq("flavor", flavor)
    .order("id", { ascending: true })
    .limit(400);

  const { data, error } = await query;
  if (error || !data?.length) return null;

  const rows = data as GameRow[];
  const idx = hashStringToUint32(`connections-daily|${utcDateKey}`) % rows.length;
  return rows[idx] ?? null;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function pickRowPreferringLowUse(
  rows: GameRow[],
  randomTieBreak: boolean
): GameRow {
  const minUse = Math.min(...rows.map((r) => (r.used_count ?? 0)));
  const tied = rows.filter((r) => (r.used_count ?? 0) === minUse);
  if (!randomTieBreak || tied.length <= 1) return tied[0]!;
  return tied[Math.floor(Math.random() * tied.length)]!;
}

/**
 * Fetch one unused (or least-used) puzzle of a given type from the pool.
 * Filters by `flavor` (defaults from `game_flavor_defaults`). Falls back to any row
 * in the type if no flavor match (legacy DB rows).
 */
export async function getGameFromPool(
  type: string,
  flavorOverride?: string | null,
  options?: {
    randomTieBreak?: boolean;
    excludeSignatures?: string[];
    /** If false, return null when all fetched rows are excluded. */
    allowExcludedFallback?: boolean;
  }
): Promise<GameRow | null> {
  const randomTieBreak = options?.randomTieBreak === true;
  const batchLimit = randomTieBreak ? 40 : 1;
  const excludeSet = new Set((options?.excludeSignatures ?? []).filter(Boolean));
  const allowExcludedFallback = options?.allowExcludedFallback !== false;

  const flavor = await resolveGameFlavor(type, flavorOverride);

  function signatureForRow(row: GameRow): string | null {
    const payload = row.payload as
      | ({
          uniquenessSignature?: unknown;
          puzzleId?: unknown;
          groups?: unknown;
        } & Record<string, unknown>)
      | null;
    if (!payload || typeof payload !== "object") return null;
    const sig =
      typeof payload.uniquenessSignature === "string"
        ? payload.uniquenessSignature
        : typeof payload.puzzleId === "string"
          ? payload.puzzleId
          : null;
    const trimmed = sig?.trim() || null;
    if (trimmed) return trimmed;

    // Legacy Connections rows may not have identity fields; compute a stable id from payload.
    if (row.type === "connections" && Array.isArray(payload.groups)) {
      try {
        return makeConnectionsPuzzleId(payload as unknown as ConnectionsPuzzle);
      } catch {
        return null;
      }
    }

    return null;
  }

  async function backfillConnectionsSignatureIfMissing(row: GameRow): Promise<void> {
    if (row.type !== "connections") return;
    const payload = row.payload as
      | ({ uniquenessSignature?: unknown; puzzleId?: unknown } & Record<string, unknown>)
      | null;
    if (!payload || typeof payload !== "object") return;
    const has =
      typeof payload.uniquenessSignature === "string" ||
      typeof payload.puzzleId === "string";
    if (has) return;
    if (!Array.isArray((payload as Record<string, unknown>).groups)) return;

    let puzzleId: string;
    try {
      puzzleId = makeConnectionsPuzzleId(payload as unknown as ConnectionsPuzzle);
    } catch {
      return;
    }

    const nextPayload = {
      ...payload,
      puzzleId,
      uniquenessSignature: puzzleId,
    };

    // Best-effort: don't block serving the puzzle.
    void db
      .from("games")
      .update({ payload: nextPayload as never })
      .eq("id", row.id);
  }

  function pickFromRows(rows: GameRow[]): GameRow | null {
    if (rows.length === 0) return null;
    if (excludeSet.size === 0) return pickRowPreferringLowUse(rows, randomTieBreak);
    const filtered = rows.filter((r) => {
      const sig = signatureForRow(r);
      return !sig || !excludeSet.has(sig);
    });
    if (filtered.length > 0) {
      const picked = pickRowPreferringLowUse(filtered, randomTieBreak);
      void backfillConnectionsSignatureIfMissing(picked);
      return picked;
    }
    if (!allowExcludedFallback) return null;
    const picked = pickRowPreferringLowUse(rows, randomTieBreak);
    void backfillConnectionsSignatureIfMissing(picked);
    return picked;
  }

  const { data: flavorRows } = await db
    .from("games")
    .select("*")
    .eq("type", type)
    .eq("flavor", flavor)
    .order("used_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (flavorRows?.length) {
    const picked = pickFromRows(flavorRows as GameRow[]);
    if (picked) return picked;
  }

  const { data: rows, error } = await db
    .from("games")
    .select("*")
    .eq("type", type)
    .order("used_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (error || !rows?.length) return null;
  return pickFromRows(rows as GameRow[]);
}

export async function getGameFromPoolUnseenThenReuse(
  type: string,
  flavorOverride?: string | null,
  options?: {
    randomTieBreak?: boolean;
    excludeSignatures?: string[];
  }
): Promise<{ row: GameRow | null; reusedExcluded: boolean }> {
  const strictUnseenRow = await getGameFromPool(type, flavorOverride, {
    randomTieBreak: options?.randomTieBreak,
    excludeSignatures: options?.excludeSignatures,
    allowExcludedFallback: false,
  });
  if (strictUnseenRow) return { row: strictUnseenRow, reusedExcluded: false };

  const hasExcludes = (options?.excludeSignatures?.length ?? 0) > 0;
  if (!hasExcludes) return { row: null, reusedExcluded: false };

  const reusedRow = await getGameFromPool(type, flavorOverride, {
    randomTieBreak: options?.randomTieBreak,
    excludeSignatures: options?.excludeSignatures,
    allowExcludedFallback: true,
  });
  if (!reusedRow) return { row: null, reusedExcluded: false };
  return { row: reusedRow, reusedExcluded: true };
}

/**
 * Increment used_count for a game after it's been served.
 * Non-fatal on failure — we'd rather serve a duplicate than error.
 */
export async function markGameUsed(id: string): Promise<void> {
  const rpcAttempt = await db
    .from("games")
    .update({ used_count: db.rpc("increment_used_count_game", { p_id: id }) as never })
    .eq("id", id);

  if (!rpcAttempt.error) return;

  const { data } = await db
    .from("games")
    .select("used_count")
    .eq("id", id)
    .single();
  if (data) {
    await db
      .from("games")
      .update({ used_count: (data.used_count ?? 0) + 1 })
      .eq("id", id);
  }
}

/** Count available puzzles of a given type in the pool */
export async function countGamePool(type: string): Promise<number> {
  const { count, error } = await db
    .from("games")
    .select("*", { count: "exact", head: true })
    .eq("type", type);
  if (error) return 0;
  return count ?? 0;
}

// ─── Typed accessors ──────────────────────────────────────────────────────────

export async function getCrosswordFromPool(): Promise<CrosswordPuzzle | null> {
  const row = await getGameFromPool("crossword", undefined, {
    randomTieBreak: true,
  });
  if (!row) return null;
  void markGameUsed(row.id);
  return row.payload as CrosswordPuzzle;
}

export async function getConnectionsFromPool(): Promise<ConnectionsPuzzle | null> {
  const row = await getGameFromPool("connections", undefined, {
    randomTieBreak: true,
  });
  if (!row) return null;
  void markGameUsed(row.id);
  return row.payload as ConnectionsPuzzle;
}
