/**
 * game_word_pool + user_word_search_exposure — word search freshness for signed-in users.
 */

import { db } from "@/lib/db/client";
import type { Category } from "@gentle-stream/domain/constants";
import { CATEGORIES } from "@gentle-stream/domain/constants";
import type { Difficulty } from "@gentle-stream/domain/games/types";
import {
  getWordSearchGridConfig,
  type WordSearchGeneratorOptions,
} from "@/lib/games/wordSearchGenerator";
import { getAllStaticSeedRows } from "@/lib/games/wordSearchStaticBanks";

const GAME_TYPE = "word_search";

/** Cron tops up the pool when total row count is below this */
export const MIN_WORD_POOL_TOTAL = 400;

interface PoolRow {
  word: string;
  category: string | null;
}

export function makeWordSearchSignature(words: string[]): string {
  const normalized = Array.from(
    new Set(words.map((w) => w.toUpperCase().trim()).filter(Boolean))
  ).sort();
  return normalized.join("|");
}

function signatureOverlapRatio(aSig: string, bSig: string): number {
  if (!aSig || !bSig) return 0;
  const a = new Set(aSig.split("|"));
  const b = new Set(bSig.split("|"));
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap++;
  return overlap / Math.min(a.size, b.size);
}

function normalizeCategory(category: string | undefined): string | null {
  if (!category || !category.trim()) return null;
  return CATEGORIES.includes(category as Category) ? category : null;
}

export async function getWordPoolTotalCount(): Promise<number> {
  const { count, error } = await db
    .from("game_word_pool")
    .select("*", { count: "exact", head: true })
    .eq("game_type", GAME_TYPE);

  if (error) throw new Error(`getWordPoolTotalCount: ${error.message}`);
  return count ?? 0;
}

/**
 * One-time seed from static banks when the table is empty (e.g. fresh deploy).
 */
export async function seedGameWordPoolFromStaticIfEmpty(): Promise<number> {
  const n = await getWordPoolTotalCount();
  if (n > 0) return 0;

  const rows = dedupeSeedRows(getAllStaticSeedRows());
  const payload = rows.map((r) => ({
    game_type: GAME_TYPE,
    category: r.category,
    word: r.word,
    word_length: r.word.length,
    source: r.source,
    batch_id: null as string | null,
  }));

  const chunk = 200;
  for (let i = 0; i < payload.length; i += chunk) {
    const part = payload.slice(i, i + chunk);
    const { error } = await db.from("game_word_pool").insert(part);
    if (error?.code === "23505") return 0;
    if (error) throw new Error(`seedGameWordPoolFromStaticIfEmpty: ${error.message}`);
  }

  return payload.length;
}

function dedupeSeedRows(
  rows: Array<{ category: string | null; word: string; source: string }>
) {
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const r of rows) {
    const key = `${r.category ?? ""}\0${r.word}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function fetchPoolForCategory(
  category: string | null,
  minLen: number,
  maxLen: number
): Promise<PoolRow[]> {
  const out: PoolRow[] = [];
  const seen = new Set<string>();

  if (category) {
    const { data: specific, error: e1 } = await db
      .from("game_word_pool")
      .select("word, category")
      .eq("game_type", GAME_TYPE)
      .eq("category", category)
      .gte("word_length", minLen)
      .lte("word_length", maxLen);

    if (e1) throw new Error(`fetchPoolForCategory: ${e1.message}`);
    for (const r of specific ?? []) {
      if (seen.has(r.word)) continue;
      seen.add(r.word);
      out.push({ word: r.word, category: r.category });
    }
  }

  const { data: generic, error: e2 } = await db
    .from("game_word_pool")
    .select("word, category")
    .eq("game_type", GAME_TYPE)
    .is("category", null)
    .gte("word_length", minLen)
    .lte("word_length", maxLen);

  if (e2) throw new Error(`fetchPoolForCategory (generic): ${e2.message}`);
  for (const r of generic ?? []) {
    if (seen.has(r.word)) continue;
    seen.add(r.word);
    out.push({ word: r.word, category: r.category });
  }

  return out;
}

async function fetchExposureMap(
  userId: string,
  words: string[]
): Promise<Map<string, { seen_count: number; last_seen_at: string }>> {
  const map = new Map<string, { seen_count: number; last_seen_at: string }>();
  if (words.length === 0) return map;

  const chunk = 120;
  for (let i = 0; i < words.length; i += chunk) {
    const part = words.slice(i, i + chunk);
    const { data, error } = await db
      .from("user_word_search_exposure")
      .select("word, seen_count, last_seen_at")
      .eq("user_id", userId)
      .in("word", part);

    if (error) throw new Error(`fetchExposureMap: ${error.message}`);
    for (const row of data ?? []) {
      map.set(row.word, {
        seen_count: row.seen_count,
        last_seen_at: row.last_seen_at,
      });
    }
  }

  return map;
}

function scoreWord(
  word: string,
  exposure: Map<string, { seen_count: number; last_seen_at: string }>
): number {
  const ex = exposure.get(word);
  if (!ex) return 0;
  const t = new Date(ex.last_seen_at).getTime();
  return ex.seen_count * 1_000_000 + t / 1000;
}

function jitter(): number {
  return Math.random() * 0.001;
}

/**
 * Pick words for a signed-in user, preferring words they have not seen recently.
 */
export async function selectWordsForUserPuzzle(
  userId: string,
  difficulty: Difficulty,
  feedCategory: string | undefined,
  options?: { avoidSignatures?: string[] }
): Promise<string[] | null> {
  await seedGameWordPoolFromStaticIfEmpty();

  const cat = normalizeCategory(feedCategory);
  const config = getWordSearchGridConfig(difficulty);
  const maxLen = Math.min(config.rows, config.cols) - 1;
  const minLen = 3;
  const need = config.wordCount + 12;

  let pool = await fetchPoolForCategory(cat, minLen, maxLen);
  if (pool.length < config.wordCount) {
    pool = await fetchPoolForCategory(null, minLen, maxLen);
  }
  if (pool.length < config.wordCount) return null;

  const words = pool.map((p) => p.word);
  const exposure = await fetchExposureMap(userId, words);

  const ranked = [...pool].sort((a, b) => {
    const s =
      scoreWord(a.word, exposure) +
      jitter() -
      (scoreWord(b.word, exposure) + jitter());
    return s;
  });

  const chosen: string[] = [];
  const used = new Set<string>();
  for (const row of ranked) {
    if (used.has(row.word)) continue;
    used.add(row.word);
    chosen.push(row.word);
    if (chosen.length >= need) break;
  }

  if (chosen.length < config.wordCount) return null;

  const avoid = (options?.avoidSignatures ?? []).filter(Boolean);
  if (avoid.length === 0) return chosen.slice(0, config.wordCount);

  let bestWords = chosen.slice(0, config.wordCount);
  let bestScore = Number.POSITIVE_INFINITY;
  const maxStart = Math.max(0, chosen.length - config.wordCount);
  const tries = Math.min(24, maxStart + 1);

  for (let i = 0; i < tries; i++) {
    const start = i === 0 ? 0 : Math.floor(Math.random() * (maxStart + 1));
    const candidate = chosen.slice(start, start + config.wordCount);
    if (candidate.length < config.wordCount) continue;

    const sig = makeWordSearchSignature(candidate);
    const maxOverlap = avoid.reduce(
      (mx, s) => Math.max(mx, signatureOverlapRatio(sig, s)),
      0
    );
    const exactRepeatPenalty = avoid.includes(sig) ? 1_000_000 : 0;
    const score = exactRepeatPenalty + maxOverlap * 1000 + start;
    if (score < bestScore) {
      bestScore = score;
      bestWords = candidate;
    }
  }

  return bestWords;
}

export async function recordWordSearchExposure(
  userId: string,
  words: string[],
  feedCategory: string | undefined
): Promise<void> {
  const cat = normalizeCategory(feedCategory);
  const attempts = 3;

  function isDeadlockError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { code?: string; message?: string };
    return (
      e.code === "40P01" ||
      (typeof e.message === "string" &&
        e.message.toLowerCase().includes("deadlock detected"))
    );
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    const { error } = await db.rpc("bump_word_search_exposure", {
      p_user_id: userId,
      p_words: words,
      p_category: cat,
    });

    if (!error) return;

    if (attempt < attempts - 1 && isDeadlockError(error)) {
      const backoffMs = 100 * (attempt + 1) * (attempt + 1);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    throw new Error(`recordWordSearchExposure: ${error.message}`);
  }
}

export function buildWordSearchOptions(
  feedCategory: string | undefined,
  words: string[]
): WordSearchGeneratorOptions {
  const cat = feedCategory?.trim();
  return {
    category: cat && CATEGORIES.includes(cat as Category) ? cat : undefined,
    words,
  };
}

export async function tryInsertPoolWord(row: {
  word: string;
  category: string | null;
  batchId: string;
  source?: string;
}): Promise<boolean> {
  const w = row.word.toUpperCase().trim();
  const payload = {
    game_type: GAME_TYPE,
    category: row.category,
    word: w,
    word_length: w.length,
    source: row.source ?? "agent",
    batch_id: row.batchId,
  };

  const { error } = await db.from("game_word_pool").insert(payload);
  if (error?.code === "23505") return false;
  if (error) throw new Error(`tryInsertPoolWord: ${error.message}`);
  return true;
}
