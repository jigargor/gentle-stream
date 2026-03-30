import type { Category } from "../constants";
import { INGEST_BATCH_SIZE } from "../constants";
import type { RawArticle, StoredArticle } from "../types";
import {
  insertArticles,
  getRecentHeadlines,
  getRecentSourceUrls,
  normaliseUrl,
  precheckIngestCandidate,
} from "../db/articles";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestResult {
  category: Category;
  inserted: StoredArticle[];
  attemptedCount: number;
  skippedCount: number;
  failedCount: number;
  retryCount: number;
  candidateCount: number;
  precheckRejectedCount: number;
  expansionCount: number;
  inputTokens: number;
  outputTokens: number;
  insertPer1kTokens: number;
  duplicateSkipRate: number;
  stoppedEarly: boolean;
  pipelineMode: "legacy" | "overhaul";
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

interface DiscoveryCandidate {
  headline: string;
  sourceUrl: string;
  rationale: string;
}

interface DiscoveryResult {
  candidates: DiscoveryCandidate[];
  usage: ClaudeUsage;
  retryCount: number;
}

interface TokenBudget {
  inputCap: number;
  outputCap: number;
  inputUsed: number;
  outputUsed: number;
}

interface RunIngestAgentOptions {
  pipeline?: "legacy" | "overhaul";
  maxExpansionCalls?: number;
  inputTokenCap?: number;
  outputTokenCap?: number;
  softDeadlineMs?: number;
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
  content: unknown;
}

type ContentBlock = TextBlock | SearchResultBlock | { type: string };

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runIngestAgent(
  category: Category,
  total: number = INGEST_BATCH_SIZE,
  options: RunIngestAgentOptions = {}
): Promise<IngestResult> {
  const pipeline = resolvePipelineMode(category, options.pipeline);
  if (pipeline === "legacy") return runLegacyIngest(category, total);
  return runOverhaulIngest(category, total, options);
}

async function runOverhaulIngest(
  category: Category,
  total: number,
  options: RunIngestAgentOptions
): Promise<IngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const allInserted: StoredArticle[] = [];
  const errors: string[] = [];
  let attemptedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let retryCount = 0;
  let candidateCount = 0;
  let precheckRejectedCount = 0;
  let expansionCount = 0;
  let stoppedEarly = false;
  const startedAt = Date.now();

  const [seenHeadlines, seenUrls] = await Promise.all([
    getRecentHeadlines(category, 60),
    getRecentSourceUrls(category, 120),
  ]);
  const budget = createTokenBudget(options);
  const maxExpansionCalls = Math.max(
    1,
    Math.min(options.maxExpansionCalls ?? total, total)
  );
  const hardDeadlineAt = startedAt + (options.softDeadlineMs ?? Number(process.env.INGEST_SOFT_DEADLINE_MS ?? 55_000));

  console.log(
    `[IngestAgent:overhaul] "${category}" target=${total}, maxExpansions=${maxExpansionCalls}, ` +
      `caps(in=${budget.inputCap},out=${budget.outputCap})`
  );

  let rounds = 0;
  while (allInserted.length < total && expansionCount < maxExpansionCalls) {
    rounds += 1;
    if (Date.now() >= hardDeadlineAt) {
      stoppedEarly = true;
      console.log(`[IngestAgent:overhaul] "${category}" stopping early due to runtime budget`);
      break;
    }
    if (!canSpendTokens(budget, 1200, 300)) {
      stoppedEarly = true;
      console.log(`[IngestAgent:overhaul] "${category}" stopping early due to token budget`);
      break;
    }

    const expansionsRemaining = Math.min(total - allInserted.length, maxExpansionCalls - expansionCount);
    const discoveryTarget = Math.min(24, Math.max(expansionsRemaining * 2, expansionsRemaining + 4));
    let discovery: DiscoveryResult;

    try {
      discovery = await fetchDiscoveryCandidates(
        apiKey,
        category,
        discoveryTarget,
        seenHeadlines,
        seenUrls
      );
      retryCount += discovery.retryCount;
      spendTokens(budget, discovery.usage);
      candidateCount += discovery.candidates.length;
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : "Discovery failed";
      if (errors.length < 8) errors.push(message);
      console.error(`[IngestAgent:overhaul] Discovery failed for "${category}":`, message);
      break;
    }

    const accepted: DiscoveryCandidate[] = [];
    for (const candidate of discovery.candidates) {
      if (accepted.length >= expansionsRemaining) break;
      const precheck = await precheckIngestCandidate({
        headline: candidate.headline,
        category,
        sourceUrls: [candidate.sourceUrl],
      });
      if (precheck.isDuplicate) {
        precheckRejectedCount += 1;
        skippedCount += 1;
        if (precheck.conflict) {
          console.log(
            `[IngestAgent:overhaul] Precheck duplicate (${precheck.reason}) candidate="${candidate.headline.slice(0, 72)}" conflict_id=${precheck.conflict.id} conflict_cat=${precheck.conflict.category} fetched_at=${precheck.conflict.fetchedAt} matched_url=${precheck.conflict.matchedUrl ?? "n/a"}`
          );
        }
        seenHeadlines.push(candidate.headline);
        seenUrls.push(...precheck.normalizedUrls);
        continue;
      }
      accepted.push(candidate);
    }

    if (accepted.length === 0) {
      if (rounds >= 2) {
        stoppedEarly = true;
        console.log(`[IngestAgent:overhaul] "${category}" no viable candidates after precheck`);
        break;
      }
      continue;
    }

    for (const candidate of accepted) {
      if (allInserted.length >= total || expansionCount >= maxExpansionCalls) break;
      if (Date.now() >= hardDeadlineAt) {
        stoppedEarly = true;
        break;
      }
      if (!canSpendTokens(budget, 2600, 700)) {
        stoppedEarly = true;
        break;
      }

      attemptedCount += 1;
      expansionCount += 1;
      try {
        const expanded = await fetchExpandedArticle(
          apiKey,
          category,
          candidate,
          seenHeadlines,
          seenUrls
        );
        retryCount += expanded.retryCount;
        spendTokens(budget, expanded.usage);

        const toInsert = {
          ...expanded.article,
          category,
          tags: [],
          sentiment: "uplifting" as const,
          emotions: [],
          locale: "global",
          readingTimeSecs: estimateReadingTime(expanded.article.body),
          qualityScore: 0.5,
        };

        const inserted = await insertArticles([toInsert]);
        if (inserted.length > 0) {
          allInserted.push(inserted[0]);
          seenHeadlines.push(expanded.article.headline);
          seenUrls.push(...expanded.article.sourceUrls);
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : "Expansion failed";
        if (errors.length < 8) errors.push(message);
        console.error(
          `[IngestAgent:overhaul] Expansion failed for "${category}" candidate="${candidate.headline.slice(0, 72)}":`,
          message
        );
      }
    }
  }

  const inputTokens = budget.inputUsed;
  const outputTokens = budget.outputUsed;
  const insertPer1kTokens =
    inputTokens > 0 ? Number(((allInserted.length * 1000) / inputTokens).toFixed(3)) : 0;
  const duplicateSkipRate =
    candidateCount > 0 ? Number((precheckRejectedCount / candidateCount).toFixed(4)) : 0;

  console.log(
    `[IngestAgent:overhaul] "${category}" inserted=${allInserted.length}/${total}, candidates=${candidateCount}, precheckRejected=${precheckRejectedCount}, inputTokens=${inputTokens}, outputTokens=${outputTokens}`
  );

  return {
    category,
    inserted: allInserted,
    attemptedCount,
    skippedCount,
    failedCount,
    retryCount,
    candidateCount,
    precheckRejectedCount,
    expansionCount,
    inputTokens,
    outputTokens,
    insertPer1kTokens,
    duplicateSkipRate,
    stoppedEarly,
    pipelineMode: "overhaul",
    durationMs: Date.now() - startedAt,
    errorSummary: errors.length > 0 ? errors.join(" | ").slice(0, 800) : null,
  };
}

async function runLegacyIngest(
  category: Category,
  total: number
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

  const [seenHeadlines, seenUrls] = await Promise.all([
    getRecentHeadlines(category, 20),
    getRecentSourceUrls(category, 30),
  ]);

  let inputTokens = 0;
  let outputTokens = 0;
  for (let i = 0; i < total; i++) {
    attemptedCount += 1;
    try {
      const result = await fetchOneArticle(apiKey, category, seenHeadlines, seenUrls);
      retryCount += result.retryCount;
      inputTokens += result.usage.input_tokens ?? 0;
      outputTokens += result.usage.output_tokens ?? 0;
      const article = result.article;

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
      } else skippedCount += 1;
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : "Unknown ingest error";
      if (errors.length < 8) errors.push(message);
    }
  }

  const insertPer1kTokens =
    inputTokens > 0 ? Number(((allInserted.length * 1000) / inputTokens).toFixed(3)) : 0;
  return {
    category,
    inserted: allInserted,
    attemptedCount,
    skippedCount,
    failedCount,
    retryCount,
    candidateCount: attemptedCount,
    precheckRejectedCount: skippedCount,
    expansionCount: attemptedCount,
    inputTokens,
    outputTokens,
    insertPer1kTokens,
    duplicateSkipRate: attemptedCount > 0 ? Number((skippedCount / attemptedCount).toFixed(4)) : 0,
    stoppedEarly: false,
    pipelineMode: "legacy",
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

  const { data, retryCount } = await callClaudeWithWebSearch({
    apiKey,
    prompt,
    maxTokens: 1024,
  });
  const usage = readClaudeUsage(data, { input_tokens: 1500, output_tokens: 500 });
  const stopReason = typeof data.stop_reason === "string" ? data.stop_reason : "";
  if (stopReason === "max_tokens") {
    console.warn("[IngestAgent] max_tokens hit — attempting recovery");
  }

  const blocks = readContentBlocks(data);

  const extraction = extractSourceUrls(blocks);
  const sourceUrls = extraction.urls;
  if (extraction.anomalies.length > 0) {
    console.warn(
      `[IngestAgent] URL extraction anomalies (${extraction.anomalies.length}) in "${category}": ${extraction.anomalies.join(" | ").slice(0, 400)}`
    );
  }

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
  return { article, usage, retryCount };
}

// ─── URL extraction ───────────────────────────────────────────────────────────

/**
 * Extract and normalise all source URLs from web_search_tool_result blocks.
 * These are the real pages Claude read — our ground truth for deduplication.
 */
function extractSourceUrls(blocks: ContentBlock[]): { urls: string[]; anomalies: string[] } {
  const urls: string[] = [];
  const anomalies: string[] = [];

  for (const block of blocks) {
    if (block.type !== "web_search_tool_result") continue;
    const searchBlock = block as SearchResultBlock;
    if (!Array.isArray(searchBlock.content)) {
      anomalies.push(`tool_result_non_array_content:${typeof searchBlock.content}`);
      continue;
    }
    for (const maybeResult of searchBlock.content) {
      const result = maybeResult as Partial<SearchResultItem> | null;
      if (result && result.type === "web_search_result" && typeof result.url === "string") {
        urls.push(normaliseUrl(result.url));
      }
    }
  }

  return {
    urls: Array.from(new Set(urls)),
    anomalies,
  };
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
    imagePrompt: stripCitations(
      a.imagePrompt ?? composeImagePromptFallback(
        stripCitations(a.headline ?? "Uplifting news"),
        a.location ?? "Global",
        category
      )
    ),
    sourceUrls,
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

function resolvePipelineMode(
  category: Category,
  override?: "legacy" | "overhaul"
): "legacy" | "overhaul" {
  if (override) return override;
  const enabledFlag = process.env.INGEST_OVERHAUL_ENABLED;
  const enabled = enabledFlag == null ? true : isTruthy(enabledFlag);
  if (!enabled) return "legacy";
  const canaryRaw = process.env.INGEST_OVERHAUL_CANARY_CATEGORIES ?? "";
  const canary = canaryRaw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (canary.length === 0) return "overhaul";
  return canary.includes(category.toLowerCase()) ? "overhaul" : "legacy";
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function createTokenBudget(options: RunIngestAgentOptions): TokenBudget {
  return {
    inputCap: Math.max(1500, options.inputTokenCap ?? Number(process.env.INGEST_RUN_INPUT_TOKEN_CAP ?? 25_000)),
    outputCap: Math.max(500, options.outputTokenCap ?? Number(process.env.INGEST_RUN_OUTPUT_TOKEN_CAP ?? 8_000)),
    inputUsed: 0,
    outputUsed: 0,
  };
}

function canSpendTokens(
  budget: TokenBudget,
  estimatedInput: number,
  estimatedOutput: number
): boolean {
  return (
    budget.inputUsed + estimatedInput <= budget.inputCap &&
    budget.outputUsed + estimatedOutput <= budget.outputCap
  );
}

function spendTokens(budget: TokenBudget, usage: ClaudeUsage): void {
  budget.inputUsed += usage.input_tokens ?? 0;
  budget.outputUsed += usage.output_tokens ?? 0;
}

async function fetchDiscoveryCandidates(
  apiKey: string,
  category: Category,
  targetCount: number,
  seenHeadlines: string[],
  seenUrls: string[]
): Promise<DiscoveryResult> {
  const avoidHeadlines = seenHeadlines.slice(-30).join("; ");
  const avoidUrls = seenUrls.slice(-60).join(", ");
  const prompt =
    `Search the web for ${targetCount} recent uplifting stories in category "${category}".\n` +
    `Return ONLY a raw JSON object with shape {"candidates":[{"headline":"string","sourceUrl":"https://...","rationale":"string"}]}.\n` +
    `Rules:\n` +
    `- sourceUrl must be the canonical article URL for each story.\n` +
    `- unique stories only; avoid similar rewrites of the same event.\n` +
    (avoidHeadlines ? `- never repeat these headlines: ${avoidHeadlines}\n` : "") +
    (avoidUrls ? `- never use these source URLs: ${avoidUrls}\n` : "") +
    `- positive stories only; no war, death, crime, or disasters.\n`;

  const { data, retryCount } = await callClaudeWithWebSearch({
    apiKey,
    prompt,
    maxTokens: 1400,
  });
  const usage = readClaudeUsage(data, { input_tokens: 1200, output_tokens: 400 });
  const blocks = readContentBlocks(data);
  const text = blocks
    .filter((b): b is TextBlock => b.type === "text" && "text" in b)
    .map((b) => b.text)
    .join("\n");
  const parsed = parseJsonPayload(text);
  const rawCandidates =
    (Array.isArray(parsed) ? parsed : (parsed as { candidates?: unknown } | null)?.candidates) ?? [];
  const candidates = normalizeDiscoveryCandidates(rawCandidates);
  return { candidates, usage, retryCount };
}

function normalizeDiscoveryCandidates(raw: unknown): DiscoveryCandidate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DiscoveryCandidate[] = [];
  for (const item of raw) {
    const candidate = item as {
      headline?: string;
      sourceUrl?: string;
      source_url?: string;
      rationale?: string;
    } | null;
    const headline = candidate?.headline?.trim() ?? "";
    const sourceUrl = (candidate?.sourceUrl ?? candidate?.source_url ?? "").trim();
    if (!headline || !sourceUrl) continue;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      continue;
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") continue;
    const key = `${headline.toLowerCase()}|${normaliseUrl(sourceUrl)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      headline,
      sourceUrl: parsedUrl.toString(),
      rationale: candidate?.rationale?.trim() ?? "",
    });
  }
  return out;
}

async function fetchExpandedArticle(
  apiKey: string,
  category: Category,
  candidate: DiscoveryCandidate,
  seenHeadlines: string[],
  seenUrls: string[]
): Promise<FetchResult> {
  const avoidHeadlines = seenHeadlines.slice(-20).join("; ");
  const avoidUrls = seenUrls.slice(-35).join(", ");
  const prompt =
    `You are expanding one discovered story into a publishable article.\n` +
    `Target category: "${category}".\n` +
    `Priority candidate headline: "${candidate.headline}".\n` +
    `Priority source URL: "${candidate.sourceUrl}".\n` +
    `Candidate rationale: "${candidate.rationale}".\n` +
    `\nUse web search to verify details and return ONLY one JSON object:\n` +
    `{"headline":"string","subheadline":"string","byline":"By Name","location":"City, Country","category":"${category}","body":"paragraph1\\n\\nparagraph2\\n\\nparagraph3","pullQuote":"string","imagePrompt":"string"}\n` +
    `\nHard requirements:\n` +
    `- Use the same underlying story/event as the candidate.\n` +
    `- Body must be clean prose with no source links, no citations, no markdown links.\n` +
    `- imagePrompt must describe a concrete, story-specific editorial scene with people/place/action when applicable.\n` +
    `- imagePrompt must avoid generic stock wording and must not request text overlays, logos, or watermarks.\n` +
    (avoidHeadlines ? `- Do not repeat these stories: ${avoidHeadlines}\n` : "") +
    (avoidUrls ? `- Do not use these URLs: ${avoidUrls}\n` : "");

  const { data, retryCount } = await callClaudeWithWebSearch({
    apiKey,
    prompt,
    maxTokens: 1200,
  });
  const usage = readClaudeUsage(data, { input_tokens: 1500, output_tokens: 500 });
  const blocks = readContentBlocks(data);
  const extraction = extractSourceUrls(blocks);
  if (extraction.anomalies.length > 0) {
    console.warn(
      `[IngestAgent:overhaul] URL extraction anomalies for candidate "${candidate.headline.slice(0, 72)}": ${extraction.anomalies.join(" | ").slice(0, 300)}`
    );
  }

  const text = blocks
    .filter((b): b is TextBlock => b.type === "text" && "text" in b)
    .map((b) => b.text)
    .join("\n");
  if (!text) throw new Error("Expansion returned no text content");

  const sourceUrlSet = new Set<string>([normaliseUrl(candidate.sourceUrl), ...extraction.urls]);
  const article = parseArticleFromText(text, category, Array.from(sourceUrlSet));
  if (article.sourceUrls.length === 0) article.sourceUrls = [normaliseUrl(candidate.sourceUrl)];

  return { article, usage, retryCount };
}

interface ClaudeRequestInput {
  apiKey: string;
  prompt: string;
  maxTokens: number;
}

async function callClaudeWithWebSearch(input: ClaudeRequestInput): Promise<{
  data: Record<string, unknown>;
  retryCount: number;
}> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: input.maxTokens,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: input.prompt }],
      }),
    });

    if ((response.status === 429 || response.status === 529) && attempt < maxAttempts) {
      const waitMs = Math.min(10_000, 2_000 * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API ${response.status}: ${err}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    return { data, retryCount: attempt };
  }
  throw new Error("Claude API exhausted retries");
}

function parseJsonPayload(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  if (!cleaned) return null;
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");

  if (objStart !== -1 && objEnd !== -1) {
    try {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    } catch {
      // keep trying
    }
  }
  if (arrStart !== -1 && arrEnd !== -1) {
    try {
      return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    } catch {
      // keep trying
    }
  }
  return null;
}

function composeImagePromptFallback(
  headline: string,
  location: string,
  category: string
): string {
  return `Editorial documentary photo about "${headline}" in ${location} (${category}), realistic lighting, human-centered moment, no text, no logos, no watermark`;
}

function readClaudeUsage(
  data: Record<string, unknown>,
  fallback: ClaudeUsage
): ClaudeUsage {
  const usage = data.usage as Partial<ClaudeUsage> | undefined;
  const inputTokens = typeof usage?.input_tokens === "number" ? usage.input_tokens : fallback.input_tokens;
  const outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : fallback.output_tokens;
  return { input_tokens: inputTokens, output_tokens: outputTokens };
}

function readContentBlocks(data: Record<string, unknown>): ContentBlock[] {
  const content = data.content;
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}
