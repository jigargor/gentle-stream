/**
 * Batch-ingest uplifting / spiritual word-search vocabulary via Claude.
 * Inserts into game_word_pool (source = agent). Run from cron or `npm run games:word-pool`.
 */

import { randomUUID } from "crypto";
import { CATEGORIES, type Category } from "@/lib/constants";
import {
  getWordPoolTotalCount,
  MIN_WORD_POOL_TOTAL,
  tryInsertPoolWord,
} from "@/lib/db/gameWordPool";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/** New words requested per category each run */
const WORDS_PER_CATEGORY = 22;

export async function runWordSearchPoolIngest(
  targetCategory?: Category
): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const categories = targetCategory ? [targetCategory] : [...CATEGORIES];
  const batchId = randomUUID();
  let inserted = 0;

  for (const category of categories) {
    try {
      const words = await fetchWordsForCategory(apiKey, category);
      const normalized = validateAndNormalizeWords(words);
      if (normalized.length === 0) continue;

      let n = 0;
      for (const word of normalized) {
        const ok = await tryInsertPoolWord({
          word,
          category,
          batchId,
        });
        if (ok) n += 1;
      }
      inserted += n;
      await sleep(1500);
    } catch (e) {
      console.error(`[WordSearchPoolIngest] ${category}:`, e);
    }
  }

  return inserted;
}

async function fetchWordsForCategory(
  apiKey: string,
  category: string
): Promise<string[]> {
  const prompt =
    `You are curating words for a gentle, uplifting word-search puzzle for adults.\n` +
    `Theme / feed section: "${category}".\n\n` +
    `Return ONLY a JSON array of ${WORDS_PER_CATEGORY} English words that fit the theme ` +
    `or are broadly contemplative, hopeful, kind, or spiritually uplifting (non-denominational, inclusive).\n` +
    `Rules:\n` +
    `- Each word: UPPERCASE letters A–Z only, no spaces, hyphens, or apostrophes\n` +
    `- Length between 4 and 14 characters (inclusive)\n` +
    `- No proper names, brands, or abbreviations\n` +
    `- Avoid duplicates and near-duplicates in the list\n` +
    `- Vary length and letter patterns\n\n` +
    `Example shape: ["GRATITUDE","RIPPLE","HARBOR","GENTLE",...]\n` +
    `No markdown, no explanation — only the JSON array.`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) {
    console.error("[WordSearchPoolIngest] No JSON array:", text.slice(0, 400));
    return [];
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    console.error("[WordSearchPoolIngest] Parse error:", text.slice(0, 400));
    return [];
  }
}

function validateAndNormalizeWords(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const r of raw) {
    const w = r.toUpperCase().trim();
    if (w.length < 4 || w.length > 14) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function shouldRunWordPoolIngest(): Promise<boolean> {
  const n = await getWordPoolTotalCount();
  return n < MIN_WORD_POOL_TOTAL;
}
