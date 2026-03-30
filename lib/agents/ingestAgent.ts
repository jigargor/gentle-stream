/**
 * Ingest Agent
 *
 * Fetches one article per API call to avoid truncation, using real token
 * usage from each response to decide whether to continue immediately or
 * wait out the 65-second rate-limit window.
 *
 * Deduplication layers (in order):
 *   1. Headline fingerprint pre-flight  — catches casing/punctuation variants
 *   2. Source URL overlap check         — catches same article, different title
 *   3. DB upsert ignoreDuplicates       — last resort constraint enforcement
 *   4. Prompt avoid-list (headlines)    — stops Claude searching the same story
 *   5. Prompt URL blocklist             — stops Claude using the same sources
 */

import type { Category } from "../constants";
import { INGEST_BATCH_SIZE } from "../constants";
import type { RawArticle, StoredArticle } from "../types";
import {
  insertArticles,
  getRecentHeadlines,
  getRecentSourceUrls,
  normaliseUrl,
} from "../db/articles";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ─── Token budget ─────────────────────────────────────────────────────────────
const TOKEN_LIMIT_PER_WINDOW = 25_000;
const WINDOW_MS = 65_000;

let windowStart = Date.now();
let tokensUsedInWindow = 0;

async function recordUsageAndWaitIfNeeded(inputTokens: number): Promise<void> {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    tokensUsedInWindow = 0;
    console.log("[IngestAgent] Token window reset");
  }

  tokensUsedInWindow += inputTokens;
  console.log(`[IngestAgent] Tokens this window: ${tokensUsedInWindow}/${TOKEN_LIMIT_PER_WINDOW}`);

  if (tokensUsedInWindow >= TOKEN_LIMIT_PER_WINDOW) {
    const waitMs = Math.max(WINDOW_MS - (Date.now() - windowStart) + 500, 0);
    console.log(`[IngestAgent] Budget exhausted — waiting ${Math.round(waitMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, waitMs));
    windowStart = Date.now();
    tokensUsedInWindow = 0;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestResult {
  category: Category;
  inserted: StoredArticle[];
  attemptedCount: number;
  skippedCount: number;
  failedCount: number;
  retryCount: number;
  durationMs: number;
  errorSummary: string | null;
  error?: string;
}

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

interface FetchResult {
  article: RawArticle;
  usage: ClaudeUsage;
  retryCount: number;
}

// ─── Content block types from the raw Claude response ─────────────────────────
interface TextBlock {
  type: "text";
  text: string;
}

interface SearchResultItem {
  type: "web_search_result";
  url: string;
  title?: string;
  encrypted_content?: string;
}

interface SearchResultBlock {
  type: "web_search_tool_result";
  tool_use_id: string;
  content: SearchResultItem[];
}

type ContentBlock = TextBlock | SearchResultBlock | { type: string };

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runIngestAgent(
  category: Category,
  total: number = INGEST_BATCH_SIZE
): Promise<IngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const allInserted: StoredArticle[] = [];
  const errors: string[] = [];
  let attemptedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let retryCount = 0;
  const startedAt = Date.now();

  // Seed both avoid-lists from the DB so re-runs don't repeat stored content
  const [seenHeadlines, seenUrls] = await Promise.all([
    getRecentHeadlines(category, 20),
    getRecentSourceUrls(category, 30),
  ]);

  console.log(
    `[IngestAgent] "${category}" — ${seenHeadlines.length} headlines, ` +
    `${seenUrls.length} URLs loaded as avoid-lists`
  );
  console.log(`[IngestAgent] Starting ingest for "${category}", target: ${total}`);

  for (let i = 0; i < total; i++) {
    attemptedCount += 1;
    try {
      const result = await fetchOneArticle(apiKey, category, seenHeadlines, seenUrls);
      const { article, usage } = result;
      retryCount += result.retryCount;

      const toInsert = {
        ...article,
        category,
        tags: [],
        sentiment: "uplifting" as const,
        emotions: [],
        locale: "global",
        readingTimeSecs: estimateReadingTime(article.body),
        qualityScore: 0.5,
      };

      const inserted = await insertArticles([toInsert]);

      if (inserted.length > 0) {
        allInserted.push(inserted[0]);
        seenHeadlines.push(article.headline);
        seenUrls.push(...article.sourceUrls);
        console.log(
          `[IngestAgent] "${category}" ${i + 1}/${total} inserted: "${article.headline.slice(0, 50)}"`
        );
      } else {
        skippedCount += 1;
        console.log(
          `[IngestAgent] "${category}" ${i + 1}/${total} skipped (duplicate): "${article.headline.slice(0, 50)}"`
        );
      }

      await recordUsageAndWaitIfNeeded(usage.input_tokens);
    } catch (e) {
      console.error(`[IngestAgent] Error on article ${i + 1} for "${category}":`, e);
      failedCount += 1;
      const message =
        e instanceof Error ? e.message : "Unknown ingest error";
      if (errors.length < 8) errors.push(message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(`[IngestAgent] "${category}" complete: ${allInserted.length}/${total} inserted`);
  return {
    category,
    inserted: allInserted,
    attemptedCount,
    skippedCount,
    failedCount,
    retryCount,
    durationMs: Date.now() - startedAt,
    errorSummary: errors.length > 0 ? errors.join(" | ").slice(0, 800) : null,
  };
}

export async function runFullIngest(): Promise<IngestResult[]> {
  const { CATEGORIES } = await import("../constants");
  const results: IngestResult[] = [];
  for (const cat of CATEGORIES) {
    results.push(await runIngestAgent(cat as Category));
  }
  return results;
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function fetchOneArticle(
  apiKey: string,
  category: string,
  seenHeadlines: string[],
  seenUrls: string[]
): Promise<FetchResult> {
  const avoidHeadlines = seenHeadlines.slice(-8).join("; ");
  const avoidUrls = seenUrls.slice(-20).join(", ");

  const prompt =
    `Search the web for 1 real, recent, uplifting news story in: "${category}". ` +
    `Positive only — no deaths, crimes, or disasters.\n` +
    (avoidHeadlines ? `Do not repeat these stories: ${avoidHeadlines}.\n` : "") +
    (avoidUrls ? `Do not use content from these URLs: ${avoidUrls}.\n` : "") +
    `\nIMPORTANT: Write body in plain prose. No <cite> tags, reference numbers, or source links in the text.\n\n` +
    `Return ONLY a single raw JSON object — no array, no markdown, no preamble:\n` +
    `{"headline":"string","subheadline":"string","byline":"By Name","location":"City, Country",` +
    `"category":"${category}","body":"paragraph1\\n\\nparagraph2\\n\\nparagraph3","pullQuote":"string","imagePrompt":"string"}`;

  const makeRequest = async (
    attempt: number
  ): Promise<{ response: Response; retryCount: number }> => {
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
        max_tokens: 1024,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429 && attempt < 3) {
      const wait = (attempt + 1) * 12_000;
      console.log(`[IngestAgent] 429 — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      const next = await makeRequest(attempt + 1);
      return { response: next.response, retryCount: next.retryCount + 1 };
    }
    return { response: res, retryCount: 0 };
  };

  const requestResult = await makeRequest(0);
  const response = requestResult.response;
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const usage: ClaudeUsage = data.usage ?? { input_tokens: 1500, output_tokens: 500 };

  if (data.stop_reason === "max_tokens") {
    console.warn("[IngestAgent] max_tokens hit — attempting recovery");
  }

  const blocks: ContentBlock[] = data.content ?? [];

  // Extract URLs from all web_search_tool_result blocks
  const sourceUrls = extractSourceUrls(blocks);

  // Combine all text blocks
  const combinedText = blocks
    .filter((b): b is TextBlock => b.type === "text" && "text" in b)
    .map((b) => b.text)
    .join("\n");

  if (!combinedText) {
    console.error("[IngestAgent] No text blocks. Response:", JSON.stringify(data));
    throw new Error("No text blocks in Claude response");
  }

  const article = parseArticleFromText(combinedText, category, sourceUrls);
  return { article, usage, retryCount: requestResult.retryCount };
}

// ─── URL extraction ───────────────────────────────────────────────────────────

/**
 * Extract and normalise all source URLs from web_search_tool_result blocks.
 * These are the real pages Claude read — our ground truth for deduplication.
 */
function extractSourceUrls(blocks: ContentBlock[]): string[] {
  const urls: string[] = [];

  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    const searchBlock = block as SearchResultBlock;
    for (const result of searchBlock.content ?? []) {
      if (result.type === "web_search_result" && result.url) {
        urls.push(normaliseUrl(result.url));
      }
    }
  }

  // Deduplicate
  return Array.from(new Set(urls));
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseArticleFromText(
  text: string,
  category: string,
  sourceUrls: string[]
): RawArticle {
  const cleaned = text.replace(/```json|```/g, "").trim();

  const objStart = cleaned.indexOf("{");
  const objEnd   = cleaned.lastIndexOf("}");
  const arrStart = cleaned.indexOf("[");
  const arrEnd   = cleaned.lastIndexOf("]");

  let parsed: Record<string, string> | null = null;

  if (objStart !== -1 && objEnd !== -1) {
    try { parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1)); } catch { /* fall through */ }
  }
  if (!parsed && arrStart !== -1 && arrEnd !== -1) {
    try {
      const arr = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
      parsed = Array.isArray(arr) ? arr[0] : arr;
    } catch { /* fall through */ }
  }

  if (!parsed) {
    console.error("[IngestAgent] JSON parse failed:\n", cleaned.slice(0, 400));
    throw new Error("JSON parse failed — no valid object or array found");
  }

  const a = Array.isArray(parsed) ? parsed[0] : parsed;

  return {
    headline:    stripCitations(a.headline    ?? "Untitled"),
    subheadline: stripCitations(a.subheadline ?? ""),
    byline:      a.byline    ?? "By Staff Reporter",
    location:    a.location  ?? "Global",
    category:    (a.category ?? category) as RawArticle["category"],
    body:        stripCitations(a.body        ?? ""),
    pullQuote:   stripCitations(a.pullQuote   ?? ""),
    imagePrompt: stripCitations(a.imagePrompt ?? ""),
    sourceUrls,  // URLs extracted from the search result blocks
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).length / 200) * 60);
}

function stripCitations(text: string): string {
  return text
    .replace(/<cite[^>]*>/gi, "")
    .replace(/<\/cite>/gi, "")
    .trim();
}
