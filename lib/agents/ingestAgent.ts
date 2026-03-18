/**
 * Ingest Agent
 *
 * Fetches articles in small batches (2 at a time) to stay well within
 * token limits. Uses a per-minute token tracker so it never hits the
 * 30k input tokens/min rate limit. Writes untagged articles to the DB.
 */

import type { Category } from "../constants";
import { INGEST_BATCH_SIZE } from "../constants";
import type { RawArticle, StoredArticle } from "../types";
import { insertArticles } from "../db/articles";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ─── Per-minute token budget tracker ──────────────────────────────────────────
// Anthropic free tier: 30,000 input tokens / minute.
// We stay safely under by tracking usage and pausing when close.
const TOKEN_LIMIT_PER_MIN = 25000; // conservative buffer below the 30k hard limit
const TOKENS_PER_REQUEST  = 1500;  // estimated input tokens per 2-article request

let tokenWindowStart = Date.now();
let tokensUsedThisWindow = 0;

async function acquireTokenBudget(): Promise<void> {
  const now = Date.now();
  const windowAge = now - tokenWindowStart;

  // Reset window every 65 seconds (slight overrun so we're never on the edge)
  if (windowAge >= 65_000) {
    tokenWindowStart = now;
    tokensUsedThisWindow = 0;
  }

  if (tokensUsedThisWindow + TOKENS_PER_REQUEST > TOKEN_LIMIT_PER_MIN) {
    const waitMs = 65_000 - windowAge + 500; // wait out the remainder of the window
    console.log(`[IngestAgent] Rate-limit budget reached — waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    tokenWindowStart = Date.now();
    tokensUsedThisWindow = 0;
  }

  tokensUsedThisWindow += TOKENS_PER_REQUEST;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestResult {
  category: Category;
  inserted: StoredArticle[];
  error?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ingest articles for one category in batches of 2.
 * Total articles = INGEST_BATCH_SIZE (default 10), fetched over multiple small calls.
 */
export async function runIngestAgent(
  category: Category,
  total: number = INGEST_BATCH_SIZE
): Promise<IngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const BATCH = 2;
  const allInserted: StoredArticle[] = [];
  const seenHeadlines: string[] = [];

  for (let fetched = 0; fetched < total; fetched += BATCH) {
    await acquireTokenBudget();

    try {
      const articles = await fetchBatch(apiKey, category, BATCH, seenHeadlines);

      if (articles.length === 0) {
        console.warn(`[IngestAgent] Empty batch for "${category}" — stopping early`);
        break;
      }

      const toInsert = articles.map((a) => ({
        ...a,
        category,
        tags: [],
        sentiment: "uplifting" as const,
        emotions: [],
        locale: "global",
        readingTimeSecs: estimateReadingTime(a.body),
        qualityScore: 0.5,
      }));

      const inserted = await insertArticles(toInsert);
      allInserted.push(...inserted);
      seenHeadlines.push(...articles.map((a) => a.headline));

      console.log(
        `[IngestAgent] "${category}" — batch done, total so far: ${allInserted.length}/${total}`
      );
    } catch (e) {
      console.error(`[IngestAgent] Batch error for "${category}":`, e);
      // Don't abort the whole run — skip this batch and continue
    }
  }

  return { category, inserted: allInserted };
}

/**
 * Run ingest across ALL categories sequentially to avoid hammering the API.
 */
export async function runFullIngest(): Promise<IngestResult[]> {
  const { CATEGORIES } = await import("../constants");
  const results: IngestResult[] = [];

  for (const cat of CATEGORIES) {
    const result = await runIngestAgent(cat as Category);
    results.push(result);
  }

  return results;
}

// ─── Core fetch (2 articles per call) ─────────────────────────────────────────

async function fetchBatch(
  apiKey: string,
  category: string,
  count: number,
  avoidHeadlines: string[]
): Promise<RawArticle[]> {
  const avoid = avoidHeadlines.slice(-6).join("; ");
  const avoidClause = avoid ? ` Do not repeat: ${avoid}.` : "";

  const prompt =
    `Search the web for ${count} real, recent, uplifting news stories in: "${category}". ` +
    `Positive only — no deaths, crimes, or disasters.${avoidClause}\n\n` +
    `Return ONLY a raw JSON array — no preamble, no explanation, no markdown fences:\n` +
    `[{"headline":"string","subheadline":"string","byline":"By Name","location":"City, Country",` +
    `"category":"${category}","body":"3 paragraphs separated by \\n\\n","pullQuote":"string","imagePrompt":"string"}]`;

  const makeRequest = async (attempt: number): Promise<Response> => {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048, // 2 articles is comfortably under 2k output tokens
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429 && attempt < 3) {
      const wait = (attempt + 1) * 10_000;
      console.log(`[IngestAgent] 429 — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return makeRequest(attempt + 1);
    }
    return res;
  };

  const response = await makeRequest(0);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const data = await response.json();

  if (data.stop_reason === "max_tokens") {
    console.warn("[IngestAgent] max_tokens hit — response truncated. Attempting partial parse.");
  }

  // Collect ALL text blocks (web search produces multiple content blocks)
  const blocks: Array<{ type: string; text?: string }> = data.content ?? [];
  const combinedText = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");

  if (!combinedText) {
    console.error("[IngestAgent] No text blocks. Full response:", JSON.stringify(data));
    throw new Error("No text blocks in Claude response");
  }

  // Strip any preamble before the JSON array
  const start = combinedText.indexOf("[");
  if (start === -1) {
    console.error("[IngestAgent] No '[' found in:\n", combinedText.slice(0, 300));
    throw new Error("No JSON array in response");
  }

  // If response was truncated, find the last complete object
  let jsonSlice = combinedText.slice(start);
  const end = jsonSlice.lastIndexOf("]");

  if (end === -1) {
    // Truncated — try to recover by closing the array after the last complete object
    const lastCompleteObj = jsonSlice.lastIndexOf("}");
    if (lastCompleteObj === -1) throw new Error("Response too truncated to recover");
    jsonSlice = jsonSlice.slice(0, lastCompleteObj + 1) + "]";
    console.warn("[IngestAgent] Truncated response — recovered partial array");
  } else {
    jsonSlice = jsonSlice.slice(0, end + 1);
  }

  // Strip markdown fences if Claude added them anyway
  jsonSlice = jsonSlice.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(jsonSlice) as RawArticle[];
  } catch (e) {
    console.error("[IngestAgent] JSON parse failed:\n", jsonSlice.slice(0, 400));
    throw new Error(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).length / 200) * 60);
}
