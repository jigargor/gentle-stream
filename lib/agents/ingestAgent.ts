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
import { getEnv } from "@/lib/env";
import {
  buildClaudeWebSearchMessageParams,
  CLAUDE_WEB_SEARCH_MODEL,
  createMessageBatch,
  fetchMessageBatchResultsJsonl,
  parseMessageBatchJsonlLine,
  pollMessageBatchUntilEnded,
} from "@/lib/anthropic/messageBatch";
import { captureException, captureMessage, startSpan } from "@/lib/observability";
import { logLlmProviderCall } from "@/lib/db/llmProviderCalls";
import { checkUpliftPolicy } from "@/lib/agents/upliftPolicyFilter";
import { discoverCandidatesFromRss } from "@/lib/rss/discovery";
import { fetchArticlePlainTextFromUrl } from "@/lib/rss/articleContent";
import {
  chooseRssNarrativeContent,
  normalizeRssNarrativeText,
} from "@/lib/rss/rssNarrativeMerge";
import {
  resolveIngestDiscoveryProvider,
  type IngestDiscoveryProvider,
} from "@/lib/agents/ingestDiscoveryProvider";
import { stripInlineHtmlToPlainText } from "@gentle-stream/feed-engine";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const RSS_FEED_BODY_SKIP_SOURCE_FETCH_CHARS = 2500;
const env = getEnv();

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestResult {
  category: Category;
  targetLocale: string;
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
  policyRejectedCount: number;
  policyRejectReasons: Record<string, number>;
  batchFallbackCount: number;
  discoveryProvider: IngestDiscoveryProvider;
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
  sourcePublishedAt?: string | null;
  summary?: string | null;
  body?: string | null;
  imageUrl?: string | null;
}

interface DiscoveryResult {
  candidates: DiscoveryCandidate[];
  usage: ClaudeUsage;
  retryCount: number;
  provider: IngestDiscoveryProvider;
}

interface TokenBudget {
  inputCap: number;
  outputCap: number;
  inputUsed: number;
  outputUsed: number;
}

interface RunIngestAgentOptions {
  pipeline?: "legacy" | "overhaul";
  discoveryProvider?: IngestDiscoveryProvider;
  ingestRunId?: string;
  /** Rewrite discovered stories with Claude expansion. Defaults false when unset. */
  rewriteEnabled?: boolean;
  maxExpansionCalls?: number;
  inputTokenCap?: number;
  outputTokenCap?: number;
  softDeadlineMs?: number;
  targetLocale?: string;
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
  const targetLocale = resolveTargetLocale(options.targetLocale);
  const span = startSpan("agent.ingest", { category, total, targetLocale });
  const pipeline = resolvePipelineMode(category, options.pipeline);
  try {
    const result =
      pipeline === "legacy"
        ? await runLegacyIngest(category, total, targetLocale, options.ingestRunId ?? null)
        : await runOverhaulIngest(category, total, options);
    span.end({
      category,
      pipeline: result.pipelineMode,
      insertedCount: result.inserted.length,
      failedCount: result.failedCount,
      stoppedEarly: result.stoppedEarly,
    });
    return result;
  } catch (error) {
    captureException(error, { agent: "ingest", category, pipeline });
    span.end({ category, pipeline, failed: true });
    throw error;
  }
}

async function runOverhaulIngest(
  category: Category,
  total: number,
  options: RunIngestAgentOptions
): Promise<IngestResult> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() || null;
  const rewriteEnabled = options.rewriteEnabled ?? (env.INGEST_REWRITE_ENABLED ?? false);
  if (rewriteEnabled && !apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const allInserted: StoredArticle[] = [];
  const errors: string[] = [];
  let attemptedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let retryCount = 0;
  let candidateCount = 0;
  let precheckRejectedCount = 0;
  let expansionCount = 0;
  let policyRejectedCount = 0;
  let batchFallbackCount = 0;
  const policyRejectReasons: Record<string, number> = {};
  let stoppedEarly = false;
  const startedAt = Date.now();
  const targetLocale = resolveTargetLocale(options.targetLocale);
  const discoveryProvider = options.discoveryProvider
    ? options.discoveryProvider
    : resolveIngestDiscoveryProvider(env.INGEST_DISCOVERY_PROVIDER);
  const ingestRunId = options.ingestRunId ?? null;

  const [seenHeadlines, seenUrls] = await Promise.all([
    getRecentHeadlines(category, 60),
    getRecentSourceUrls(category, 120),
  ]);
  const budget = createTokenBudget(options);
  const maxExpansionCalls = Math.max(
    1,
    Math.min(options.maxExpansionCalls ?? total, total)
  );
  const softDeadlineMs = options.softDeadlineMs ?? Number(env.INGEST_SOFT_DEADLINE_MS ?? 55_000);
  const useMessageBatch = env.INGEST_MESSAGE_BATCH == null ? true : env.INGEST_MESSAGE_BATCH;
  const batchSyncFallbackLimit = Math.max(1, Number(env.INGEST_BATCH_SYNC_FALLBACK_LIMIT ?? 3));
  const batchMaxWaitMs = Math.max(
    60_000,
    env.INGEST_BATCH_MAX_WAIT_MS ?? 3_600_000
  );
  const batchPollMs = Math.max(3_000, env.INGEST_BATCH_POLL_MS ?? 10_000);
  const hardDeadlineAt =
    startedAt +
    (useMessageBatch
      ? Math.max(softDeadlineMs, batchMaxWaitMs + 120_000)
      : softDeadlineMs);

  console.log(
    '[IngestAgent:overhaul] "%s" target=%s, maxExpansions=%s, caps(in=%s,out=%s), messageBatch=%s',
    category,
    String(total),
    String(maxExpansionCalls),
    String(budget.inputCap),
    String(budget.outputCap),
    useMessageBatch ? "on" : "off"
  );

  let rounds = 0;
  while (allInserted.length < total && expansionCount < maxExpansionCalls) {
    rounds += 1;
    if (Date.now() >= hardDeadlineAt) {
      stoppedEarly = true;
      console.log('[IngestAgent:overhaul] "%s" stopping early due to runtime budget', category);
      break;
    }
    if (!canSpendTokens(budget, 1200, 300)) {
      stoppedEarly = true;
      console.log('[IngestAgent:overhaul] "%s" stopping early due to token budget', category);
      break;
    }

    const expansionsRemaining = Math.min(total - allInserted.length, maxExpansionCalls - expansionCount);
    const discoveryTarget = Math.min(24, Math.max(expansionsRemaining * 2, expansionsRemaining + 4));
    let discovery: DiscoveryResult;

    try {
      discovery = await fetchDiscoveryCandidates(
        apiKey,
        category,
        targetLocale,
        discoveryProvider,
        discoveryTarget,
        seenHeadlines,
        seenUrls,
        ingestRunId
      );
      retryCount += discovery.retryCount;
      spendTokens(budget, discovery.usage);
      candidateCount += discovery.candidates.length;
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : "Discovery failed";
      if (errors.length < 8) errors.push(message);
      captureException(error, {
        agent: "ingest",
        category,
        phase: "discovery",
      });
      console.error('[IngestAgent:overhaul] Discovery failed for "%s": %s', category, message);
      break;
    }

    const accepted: DiscoveryCandidate[] = [];
    for (const candidate of discovery.candidates) {
      if (accepted.length >= expansionsRemaining) break;
      const candidateHasRssContent = hasRssNarrativeContent(candidate);
      const shouldUseRssNativePolicyPhase =
        !rewriteEnabled &&
        candidateHasRssContent &&
        (discoveryProvider === "rss_seed_only" || discoveryProvider === "rss_seeded_primary");
      if (!shouldUseRssNativePolicyPhase) {
        const policyCheck = checkUpliftPolicy({
          headline: candidate.headline,
          rationale: candidate.rationale,
        });
        if (!policyCheck.accepted) {
          policyRejectedCount += 1;
          skippedCount += 1;
          const reason = policyCheck.reason ?? "unknown";
          policyRejectReasons[reason] = (policyRejectReasons[reason] ?? 0) + 1;
          continue;
        }
      }
      const precheck = await precheckIngestCandidate({
        headline: candidate.headline,
        category,
        sourceUrls: [candidate.sourceUrl],
      });
      if (precheck.isDuplicate) {
        precheckRejectedCount += 1;
        skippedCount += 1;
        logIngestCandidateSkip({
          category,
          phase: "discovery_precheck",
          reason: precheck.reason ?? "duplicate",
          candidate,
          conflictId: precheck.conflict?.id,
          conflictCategory: precheck.conflict?.category,
        });
        if (precheck.conflict) {
          console.log(
            '[IngestAgent:overhaul] Precheck duplicate (%s) candidate="%s" conflict_id=%s conflict_cat=%s fetched_at=%s matched_url=%s',
            precheck.reason,
            candidate.headline.slice(0, 72),
            String(precheck.conflict.id),
            precheck.conflict.category,
            String(precheck.conflict.fetchedAt),
            precheck.conflict.matchedUrl ?? "n/a"
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
        console.log('[IngestAgent:overhaul] "%s" no viable candidates after precheck', category);
        break;
      }
      continue;
    }

    const ensureCandidateStillNovel = async (candidate: DiscoveryCandidate): Promise<boolean> => {
      const precheck = await precheckIngestCandidate({
        headline: candidate.headline,
        category,
        sourceUrls: [candidate.sourceUrl],
      });
      if (!precheck.isDuplicate) return true;
      precheckRejectedCount += 1;
      skippedCount += 1;
      logIngestCandidateSkip({
        category,
        phase: "discovery_precheck",
        reason: precheck.reason ?? "duplicate",
        candidate,
        conflictId: precheck.conflict?.id,
        conflictCategory: precheck.conflict?.category,
      });
      seenHeadlines.push(candidate.headline);
      seenUrls.push(...precheck.normalizedUrls);
      return false;
    };

    const processExpansionResult = async (expanded: FetchResult) => {
      const policyCheck = checkUpliftPolicy({
        headline: expanded.article.headline,
        subheadline: expanded.article.subheadline,
        body: expanded.article.body,
      });
      if (!policyCheck.accepted) {
        policyRejectedCount += 1;
        skippedCount += 1;
        const reason = policyCheck.reason ?? "unknown";
        policyRejectReasons[reason] = (policyRejectReasons[reason] ?? 0) + 1;
        return;
      }
      const toInsert = {
        ...expanded.article,
        category,
        tags: [],
        sentiment: "uplifting" as const,
        emotions: [],
        locale: targetLocale,
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
    };

    const acceptedForRewrite: DiscoveryCandidate[] = [];
    for (const candidate of accepted) {
      const fetchedSourceText =
        rewriteEnabled || !shouldFetchSourceArticle(candidate)
          ? null
          : await fetchArticlePlainTextFromUrl(candidate.sourceUrl);
      const rssArticle =
        rewriteEnabled
          ? null
          : buildArticleFromRssCandidate(
              candidate,
              category,
              targetLocale,
              fetchedSourceText
            );
      if (!rssArticle) {
        if (discoveryProvider === "rss_seed_only" && !rewriteEnabled) {
          skippedCount += 1;
          logIngestCandidateSkip({
            category,
            phase: "rewrite_gate",
            reason: hasRssNarrativeContent(candidate)
              ? "rss_seed_only_rss_native_build_failed"
              : "rss_seed_only_missing_rss_content",
            candidate,
          });
          continue;
        }
        if (!(await ensureCandidateStillNovel(candidate))) continue;
        acceptedForRewrite.push(candidate);
        continue;
      }
      if (allInserted.length >= total || expansionCount >= maxExpansionCalls) break;
      attemptedCount += 1;
      expansionCount += 1;
      try {
        const toInsert = {
          ...rssArticle,
          category,
          tags: [],
          sentiment: "uplifting" as const,
          emotions: [],
          locale: targetLocale,
          readingTimeSecs: estimateReadingTime(rssArticle.body),
          qualityScore: 0.5,
        };
        const inserted = await insertArticles([toInsert]);
        if (inserted.length > 0) {
          allInserted.push(inserted[0]);
          seenHeadlines.push(rssArticle.headline);
          seenUrls.push(...rssArticle.sourceUrls);
        } else {
          skippedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : "RSS-native insert failed";
        if (errors.length < 8) errors.push(message);
      }
    }

    const expansionApiKey = apiKey;
    if (acceptedForRewrite.length > 0 && !expansionApiKey) {
      failedCount += 1;
      const message =
        "ANTHROPIC_API_KEY not set but rewrite path required (rss_seeded_primary fallback or rewrite enabled).";
      if (errors.length < 8) errors.push(message);
      stoppedEarly = true;
      break;
    }

    if (useMessageBatch && acceptedForRewrite.length > 0) {
      try {
        const batchRows = await expandAcceptedViaMessageBatch({
          apiKey: expansionApiKey!,
          category,
          targetLocale,
          accepted: acceptedForRewrite,
          seenHeadlines,
          seenUrls,
          budget,
          maxWaitMs: batchMaxWaitMs,
          pollIntervalMs: batchPollMs,
          ingestRunId,
        });
        for (const row of batchRows) {
          if (allInserted.length >= total || expansionCount >= maxExpansionCalls) break;
          if (!canSpendTokens(budget, 2600, 700)) {
            stoppedEarly = true;
            break;
          }
          attemptedCount += 1;
          expansionCount += 1;
          if (row.fetch) {
            retryCount += row.fetch.retryCount;
            try {
              await processExpansionResult(row.fetch);
            } catch (error) {
              failedCount += 1;
              const message = error instanceof Error ? error.message : "Insert failed";
              if (errors.length < 8) errors.push(message);
            }
            continue;
          }
          try {
            const expanded = await fetchExpandedArticle(
              expansionApiKey!,
              category,
              targetLocale,
              row.candidate,
              seenHeadlines,
            seenUrls,
            ingestRunId
            );
            retryCount += expanded.retryCount;
            spendTokens(budget, expanded.usage);
            await processExpansionResult(expanded);
          } catch (error) {
            failedCount += 1;
            const message = error instanceof Error ? error.message : "Expansion failed";
            if (errors.length < 8) errors.push(message);
            captureException(error, {
              agent: "ingest",
              category,
              phase: "expansion",
              candidateHeadline: row.candidate.headline.slice(0, 72),
            });
            console.error(
              '[IngestAgent:overhaul] Expansion failed for "%s" candidate="%s": %s',
              category,
              row.candidate.headline.slice(0, 72),
              message
            );
          }
        }
      } catch (batchErr) {
        const msg = batchErr instanceof Error ? batchErr.message : "Message batch failed";
        batchFallbackCount += 1;
        captureException(batchErr, {
          agent: "ingest",
          category,
          phase: "message_batch",
        });
        console.error("[IngestAgent:overhaul] Message batch error, falling back to sync: %s", msg);
        if (errors.length < 8) errors.push(msg);
        const fallbackCandidates = acceptedForRewrite.slice(0, batchSyncFallbackLimit);
        if (acceptedForRewrite.length > fallbackCandidates.length) {
          batchFallbackCount += 1;
          skippedCount += acceptedForRewrite.length - fallbackCandidates.length;
          if (errors.length < 8)
            errors.push(
              `Batch fallback capped to ${fallbackCandidates.length}/${acceptedForRewrite.length} expansions`
            );
        }
        for (const candidate of fallbackCandidates) {
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
              expansionApiKey!,
              category,
              targetLocale,
              candidate,
              seenHeadlines,
              seenUrls,
              ingestRunId
            );
            retryCount += expanded.retryCount;
            spendTokens(budget, expanded.usage);
            await processExpansionResult(expanded);
          } catch (error) {
            failedCount += 1;
            const message = error instanceof Error ? error.message : "Expansion failed";
            if (errors.length < 8) errors.push(message);
            captureException(error, {
              agent: "ingest",
              category,
              phase: "expansion_fallback",
              candidateHeadline: candidate.headline.slice(0, 72),
            });
            console.error(
              '[IngestAgent:overhaul] Expansion failed for "%s" candidate="%s": %s',
              category,
              candidate.headline.slice(0, 72),
              message
            );
          }
        }
      }
    } else {
      for (const candidate of acceptedForRewrite) {
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
            expansionApiKey!,
            category,
            targetLocale,
            candidate,
            seenHeadlines,
            seenUrls,
            ingestRunId
          );
          retryCount += expanded.retryCount;
          spendTokens(budget, expanded.usage);
          await processExpansionResult(expanded);
        } catch (error) {
          failedCount += 1;
          const message = error instanceof Error ? error.message : "Expansion failed";
          if (errors.length < 8) errors.push(message);
          captureException(error, {
            agent: "ingest",
            category,
            phase: "expansion_sync",
            candidateHeadline: candidate.headline.slice(0, 72),
          });
          console.error(
            '[IngestAgent:overhaul] Expansion failed for "%s" candidate="%s": %s',
            category,
            candidate.headline.slice(0, 72),
            message
          );
        }
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
    '[IngestAgent:overhaul] "%s" inserted=%s/%s, candidates=%s, precheckRejected=%s, policyRejected=%s, inputTokens=%s, outputTokens=%s',
    category,
    String(allInserted.length),
    String(total),
    String(candidateCount),
    String(precheckRejectedCount),
    String(policyRejectedCount),
    String(inputTokens),
    String(outputTokens)
  );
  captureMessage({
    level: "info",
    message: "agent.ingest.overhaul_summary",
    context: {
      category,
      insertedCount: allInserted.length,
      attemptedCount,
      skippedCount,
      failedCount,
      stoppedEarly,
      candidateCount,
      targetLocale,
      precheckRejectedCount,
      duplicateSkipRate,
      policyRejectedCount,
      batchFallbackCount,
      discoveryProvider,
    },
  });

  return {
    category,
    targetLocale,
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
    policyRejectedCount,
    policyRejectReasons,
    batchFallbackCount,
    discoveryProvider,
    stoppedEarly,
    pipelineMode: "overhaul",
    durationMs: Date.now() - startedAt,
    errorSummary: errors.length > 0 ? errors.join(" | ").slice(0, 800) : null,
  };
}

async function runLegacyIngest(
  category: Category,
  total: number,
  targetLocale: string,
  ingestRunId: string | null
): Promise<IngestResult> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const allInserted: StoredArticle[] = [];
  const errors: string[] = [];
  let attemptedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let retryCount = 0;
  let policyRejectedCount = 0;
  const policyRejectReasons: Record<string, number> = {};
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
      const result = await fetchOneArticle(
        apiKey,
        category,
        targetLocale,
        seenHeadlines,
        seenUrls,
        ingestRunId
      );
      retryCount += result.retryCount;
      inputTokens += result.usage.input_tokens ?? 0;
      outputTokens += result.usage.output_tokens ?? 0;
      const article = result.article;
      const policyCheck = checkUpliftPolicy({
        headline: article.headline,
        subheadline: article.subheadline,
        body: article.body,
      });
      if (!policyCheck.accepted) {
        skippedCount += 1;
        policyRejectedCount += 1;
        const reason = policyCheck.reason ?? "unknown";
        policyRejectReasons[reason] = (policyRejectReasons[reason] ?? 0) + 1;
        continue;
      }

      const toInsert = {
        ...article,
        category,
        tags: [],
        sentiment: "uplifting" as const,
        emotions: [],
        locale: targetLocale,
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
    targetLocale,
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
    policyRejectedCount,
    policyRejectReasons,
    batchFallbackCount: 0,
    discoveryProvider: "anthropic_web_search",
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
  targetLocale: string,
  seenHeadlines: string[],
  seenUrls: string[],
  ingestRunId: string | null
): Promise<FetchResult> {
  const avoidHeadlines = seenHeadlines.slice(-8).join("; ");
  const avoidUrls = seenUrls.slice(-20).join(", ");

  const prompt =
    `Search the web for 1 real, recent, uplifting news story in: "${category}" for locale "${targetLocale}". ` +
    `Positive only — no political stories, no solemn stories, no deaths, crimes, wars, or disasters.\n` +
    (avoidHeadlines ? `Do not repeat these stories: ${avoidHeadlines}.\n` : "") +
    (avoidUrls ? `Do not use content from these URLs: ${avoidUrls}.\n` : "") +
    `\nIMPORTANT: Write body in plain prose. No <cite> tags, reference numbers, or source links in the text.\n\n` +
    `Return ONLY a single raw JSON object — no array, no markdown, no preamble:\n` +
    `{"headline":"string","subheadline":"string","byline":"By Name","location":"City, Country",` +
    `"category":"${category}","body":"paragraph1\\n\\nparagraph2\\n\\nparagraph3","pullQuote":"string","imagePrompt":"string","sourcePublishedAt":"ISO-8601 string or null"}`;

  const { data, retryCount } = await callClaudeWithWebSearch({
    apiKey,
    prompt,
    maxTokens: 1024,
    callKind: "legacy_fetch_article",
    category,
    agent: "ingest",
    route: "lib/agents/ingestAgent",
    ingestRunId,
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
      '[IngestAgent] URL extraction anomalies (%s) in "%s": %s',
      String(extraction.anomalies.length),
      category,
      extraction.anomalies.join(" | ").slice(0, 400)
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
  const cleaned = stripCodeFences(text);

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
    sourcePublishedAt: parseSourcePublishedAt(a.sourcePublishedAt ?? a.source_published_at),
    sourceUrls,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function trimToLength(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function firstSentence(value: string): string {
  const match = value.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? value).trim();
}

function hasRssNarrativeContent(candidate: DiscoveryCandidate): boolean {
  return Boolean(
    (candidate.body && candidate.body.trim().length > 0) ||
      (candidate.summary && candidate.summary.trim().length > 0)
  );
}

function logIngestCandidateSkip(input: {
  category: Category;
  phase: "discovery_precheck" | "rewrite_gate";
  reason: string;
  candidate: DiscoveryCandidate;
  conflictId?: string;
  conflictCategory?: string;
}): void {
  captureMessage({
    level: "info",
    message: "agent.ingest.candidate_skipped",
    context: {
      category: input.category,
      phase: input.phase,
      reason: input.reason,
      candidateHeadline: input.candidate.headline.slice(0, 120),
      candidateSourceUrl: normaliseUrl(input.candidate.sourceUrl).slice(0, 240),
      conflictId: input.conflictId,
      conflictCategory: input.conflictCategory,
    },
  });
}

function shouldFetchSourceArticle(candidate: DiscoveryCandidate): boolean {
  const sourceUrl = candidate.sourceUrl?.trim() ?? "";
  if (!sourceUrl) return false;
  const bodyFromFeed = normalizeRssNarrativeText(candidate.body?.trim() ?? "");
  return bodyFromFeed.length < RSS_FEED_BODY_SKIP_SOURCE_FETCH_CHARS;
}

function buildArticleFromRssCandidate(
  candidate: DiscoveryCandidate,
  category: Category,
  targetLocale: string,
  fetchedSourceText?: string | null
): RawArticle | null {
  const summary = normalizeRssNarrativeText(candidate.summary?.trim() ?? "");
  const bodyFromFeed = normalizeRssNarrativeText(candidate.body?.trim() ?? "");
  const bodyFromSource = normalizeRssNarrativeText(fetchedSourceText?.trim() ?? "");
  const content = chooseRssNarrativeContent({
    summary,
    bodyFromFeed,
    bodyFromSource,
  });
  if (!content) return null;

  const feedLabel = candidate.rationale.replace(/^RSS feed:\s*/i, "").trim();
  const cleanHeadline = stripCitations(candidate.headline).trim() || "Untitled";
  const subheadline = trimToLength(firstSentence(summary || content), 220);
  const paragraphOne = content;
  const paragraphTwo =
    candidate.sourceUrl.trim().length > 0
      ? "This report is sourced directly from the original RSS item and preserved without a full AI rewrite."
      : "This report is sourced directly from the original RSS item.";
  const body = `${paragraphOne}\n\n${paragraphTwo}`;
  const pullQuote = trimToLength(firstSentence(summary || content), 240);
  const imageSeed = candidate.imageUrl?.trim();
  const imagePrompt = imageSeed
    ? `Editorial illustration inspired by "${cleanHeadline}". Reflect the source imagery mood and scene without logos or text overlays.`
    : composeImagePromptFallback(cleanHeadline, targetLocale || "Global", category);

  return {
    headline: cleanHeadline,
    subheadline: stripCitations(subheadline),
    byline: feedLabel ? `By ${feedLabel}` : "By RSS Desk",
    location: targetLocale && targetLocale.toLowerCase() !== "global" ? targetLocale : "Global",
    category,
    body: stripCitations(body),
    pullQuote: stripCitations(pullQuote),
    imagePrompt: stripCitations(imagePrompt),
    sourcePublishedAt: parseSourcePublishedAt(candidate.sourcePublishedAt),
    sourceUrls: [normaliseUrl(candidate.sourceUrl)],
  };
}

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).length / 200) * 60);
}

function resolveTargetLocale(inputLocale?: string): string {
  const fallback = (env.INGEST_AUTO_LOCALE ?? "global").trim();
  const requested = inputLocale?.trim();
  if (!requested) return fallback || "global";
  return requested.slice(0, 48);
}

function parseSourcePublishedAt(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "null" || raw.toLowerCase() === "unknown") return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function stripCitations(text: string): string {
  return stripInlineHtmlToPlainText(text);
}

function resolvePipelineMode(
  category: Category,
  override?: "legacy" | "overhaul"
): "legacy" | "overhaul" {
  if (override) return override;
  const enabledFlag = env.INGEST_OVERHAUL_ENABLED;
  const enabled = enabledFlag == null ? true : enabledFlag;
  if (!enabled) return "legacy";
  const canaryRaw = env.INGEST_OVERHAUL_CANARY_CATEGORIES ?? "";
  const canary = canaryRaw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (canary.length === 0) return "overhaul";
  return canary.includes(category.toLowerCase()) ? "overhaul" : "legacy";
}

function createTokenBudget(options: RunIngestAgentOptions): TokenBudget {
  return {
    inputCap: Math.max(1500, options.inputTokenCap ?? Number(env.INGEST_RUN_INPUT_TOKEN_CAP ?? 25_000)),
    outputCap: Math.max(500, options.outputTokenCap ?? Number(env.INGEST_RUN_OUTPUT_TOKEN_CAP ?? 8_000)),
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
  apiKey: string | null,
  category: Category,
  targetLocale: string,
  discoveryProvider: IngestDiscoveryProvider,
  targetCount: number,
  seenHeadlines: string[],
  seenUrls: string[],
  ingestRunId: string | null
): Promise<DiscoveryResult> {
  if (discoveryProvider === "rss_seed_only" || discoveryProvider === "rss_seeded_primary") {
    const rssCandidates = await discoverCandidatesFromRss({
      categoryHint: category,
      targetLocale,
      discoveryProvider,
      targetCount,
      seenUrls,
      seenHeadlines,
    });
    if (discoveryProvider === "rss_seed_only" || rssCandidates.length >= targetCount) {
      return {
        candidates: normalizeDiscoveryCandidates(rssCandidates),
        usage: { input_tokens: 0, output_tokens: 0 },
        retryCount: 0,
        provider: discoveryProvider,
      };
    }
    const remainingCount = Math.max(0, targetCount - rssCandidates.length);
    if (remainingCount === 0)
      return {
        candidates: normalizeDiscoveryCandidates(rssCandidates),
        usage: { input_tokens: 0, output_tokens: 0 },
        retryCount: 0,
        provider: discoveryProvider,
      };
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set for rss_seeded_primary fallback discovery.");
    const webFallback = await fetchDiscoveryCandidatesAnthropic(
      apiKey,
      category,
      targetLocale,
      remainingCount,
      seenHeadlines,
      seenUrls,
      ingestRunId
    );
    return {
      candidates: normalizeDiscoveryCandidates([...rssCandidates, ...webFallback.candidates]).slice(
        0,
        targetCount
      ),
      usage: webFallback.usage,
      retryCount: webFallback.retryCount,
      provider: discoveryProvider,
    };
  }

  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set for anthropic_web_search discovery.");
  const webOnly = await fetchDiscoveryCandidatesAnthropic(
    apiKey,
    category,
    targetLocale,
    targetCount,
    seenHeadlines,
    seenUrls,
    ingestRunId
  );
  return {
    ...webOnly,
    provider: discoveryProvider,
  };
}

async function fetchDiscoveryCandidatesAnthropic(
  apiKey: string,
  category: Category,
  targetLocale: string,
  targetCount: number,
  seenHeadlines: string[],
  seenUrls: string[],
  ingestRunId: string | null
): Promise<Omit<DiscoveryResult, "provider">> {

  const avoidHeadlines = seenHeadlines.slice(-30).join("; ");
  const avoidUrls = seenUrls.slice(-60).join(", ");
  const prompt =
    `Search the web for ${targetCount} recent uplifting stories in category "${category}" for locale "${targetLocale}".\n` +
    `Return ONLY a raw JSON object with shape {"candidates":[{"headline":"string","sourceUrl":"https://...","rationale":"string"}]}.\n` +
    `Rules:\n` +
    `- sourceUrl must be the canonical article URL for each story.\n` +
    `- unique stories only; avoid similar rewrites of the same event.\n` +
    (avoidHeadlines ? `- never repeat these headlines: ${avoidHeadlines}\n` : "") +
    (avoidUrls ? `- never use these source URLs: ${avoidUrls}\n` : "") +
    `- positive stories only; no political stories, solemn stories, war, death, crime, or disasters.\n`;

  const { data, retryCount } = await callClaudeWithWebSearch({
    apiKey,
    prompt,
    maxTokens: 1400,
    callKind: "discovery_web_search",
    category,
    agent: "ingest",
    route: "lib/agents/ingestAgent",
    ingestRunId,
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
      sourcePublishedAt?: string | null;
      source_published_at?: string | null;
      summary?: string | null;
      body?: string | null;
      imageUrl?: string | null;
      image_url?: string | null;
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
      sourcePublishedAt:
        (candidate?.sourcePublishedAt ?? candidate?.source_published_at ?? null) || null,
      summary: candidate?.summary?.trim() || null,
      body: candidate?.body?.trim() || null,
      imageUrl: (candidate?.imageUrl ?? candidate?.image_url ?? null) || null,
    });
  }
  return out;
}

function buildExpansionPrompt(
  category: Category,
  targetLocale: string,
  candidate: DiscoveryCandidate,
  seenHeadlines: string[],
  seenUrls: string[]
): string {
  const avoidHeadlines = seenHeadlines.slice(-20).join("; ");
  const avoidUrls = seenUrls.slice(-35).join(", ");
  return (
    `You are expanding one discovered story into a publishable article.\n` +
    `Target category: "${category}".\n` +
    `Target locale: "${targetLocale}".\n` +
    `Priority candidate headline: "${candidate.headline}".\n` +
    `Priority source URL: "${candidate.sourceUrl}".\n` +
    `Candidate rationale: "${candidate.rationale}".\n` +
    `\nUse web search to verify details and return ONLY one JSON object:\n` +
    `{"headline":"string","subheadline":"string","byline":"By Name","location":"City, Country","category":"${category}","body":"paragraph1\\n\\nparagraph2\\n\\nparagraph3","pullQuote":"string","imagePrompt":"string","sourcePublishedAt":"ISO-8601 string or null"}\n` +
    `\nHard requirements:\n` +
    `- Use the same underlying story/event as the candidate.\n` +
    `- Must be uplifting and non-solemn; avoid politics, elections, conflict, crime, death, and disasters.\n` +
    `- Body must be clean prose with no source links, no citations, no markdown links.\n` +
    `- imagePrompt must describe a concrete, story-specific editorial scene with people/place/action when applicable.\n` +
    `- imagePrompt must avoid generic stock wording and must not request text overlays, logos, or watermarks.\n` +
    (avoidHeadlines ? `- Do not repeat these stories: ${avoidHeadlines}\n` : "") +
    (avoidUrls ? `- Do not use these URLs: ${avoidUrls}\n` : "")
  );
}

function expansionFromClaudeData(
  data: Record<string, unknown>,
  candidate: DiscoveryCandidate,
  category: Category,
  retryCount: number
): FetchResult {
  const usage = readClaudeUsage(data, { input_tokens: 1500, output_tokens: 500 });
  const blocks = readContentBlocks(data);
  const extraction = extractSourceUrls(blocks);
  if (extraction.anomalies.length > 0) {
    console.warn(
      '[IngestAgent:overhaul] URL extraction anomalies for candidate "%s": %s',
      candidate.headline.slice(0, 72),
      extraction.anomalies.join(" | ").slice(0, 300)
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

interface BatchExpansionRow {
  candidate: DiscoveryCandidate;
  fetch: FetchResult | null;
}

async function expandAcceptedViaMessageBatch(input: {
  apiKey: string;
  category: Category;
  targetLocale: string;
  accepted: DiscoveryCandidate[];
  seenHeadlines: string[];
  seenUrls: string[];
  budget: TokenBudget;
  maxWaitMs: number;
  pollIntervalMs: number;
  ingestRunId: string | null;
}): Promise<BatchExpansionRow[]> {
  const {
    apiKey,
    category,
    targetLocale,
    accepted,
    seenHeadlines,
    seenUrls,
    budget,
    maxWaitMs,
    pollIntervalMs,
    ingestRunId,
  } = input;

  const requests = accepted.map((candidate, i) => ({
    custom_id: `exp-${i}`,
    params: buildClaudeWebSearchMessageParams({
      prompt: buildExpansionPrompt(category, targetLocale, candidate, seenHeadlines, seenUrls),
      maxTokens: 1200,
    }),
  }));

  const { id: batchId } = await createMessageBatch(apiKey, requests, {
    ingestRunId,
  });
  console.log(
    "[IngestAgent:overhaul] Submitted message batch %s (%s expansions)",
    batchId,
    String(requests.length)
  );
  await pollMessageBatchUntilEnded(apiKey, batchId, { maxWaitMs, pollIntervalMs, ingestRunId });
  const lines = await fetchMessageBatchResultsJsonl(apiKey, batchId, { ingestRunId });

  const byIndex = new Map<number, FetchResult>();
  for (const line of lines) {
    const parsed = parseMessageBatchJsonlLine(line);
    if (!parsed?.succeeded || !parsed.message) continue;
    const m = /^exp-(\d+)$/.exec(parsed.custom_id);
    if (!m) continue;
    const idx = Number(m[1]);
    if (!Number.isFinite(idx) || idx < 0 || idx >= accepted.length) continue;
    try {
      const fr = expansionFromClaudeData(
        parsed.message,
        accepted[idx]!,
        category,
        0
      );
      spendTokens(budget, fr.usage);
      byIndex.set(idx, fr);
    } catch (e) {
      console.warn(
        "[IngestAgent:overhaul] Batch expansion parse failed exp-%s: %s",
        String(idx),
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return accepted.map((candidate, i) => ({
    candidate,
    fetch: byIndex.get(i) ?? null,
  }));
}

async function fetchExpandedArticle(
  apiKey: string,
  category: Category,
  targetLocale: string,
  candidate: DiscoveryCandidate,
  seenHeadlines: string[],
  seenUrls: string[],
  ingestRunId: string | null
): Promise<FetchResult> {
  const prompt = buildExpansionPrompt(
    category,
    targetLocale,
    candidate,
    seenHeadlines,
    seenUrls
  );

  const { data, retryCount } = await callClaudeWithWebSearch({
    apiKey,
    prompt,
    maxTokens: 1200,
    callKind: "expansion_web_search",
    category,
    agent: "ingest",
    route: "lib/agents/ingestAgent",
    correlationId: normaliseUrl(candidate.sourceUrl).slice(0, 240),
    ingestRunId,
  });
  return expansionFromClaudeData(data, candidate, category, retryCount);
}

interface ClaudeRequestInput {
  apiKey: string;
  prompt: string;
  maxTokens: number;
  callKind: string;
  route: string;
  agent: string;
  category?: string;
  correlationId?: string;
  ingestRunId?: string | null;
}

function messageLooksLikeCreditExhaustion(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("insufficient credits") ||
    lower.includes("credit balance") ||
    lower.includes("credits exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("billing")
  );
}

function classifyAnthropicFailure(status: number, message: string): string {
  if (status === 429 && messageLooksLikeCreditExhaustion(message)) return "anthropic_credits_exhausted";
  if (status === 429) return "anthropic_rate_limited";
  if (status === 529) return "anthropic_overloaded";
  return `http_${status}`;
}

async function callClaudeWithWebSearch(input: ClaudeRequestInput): Promise<{
  data: Record<string, unknown>;
  retryCount: number;
}> {
  const maxAttempts = 3;
  const startedAt = Date.now();
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "web-search-2025-03-05",
        },
        body: JSON.stringify(
          buildClaudeWebSearchMessageParams({
            prompt: input.prompt,
            maxTokens: input.maxTokens,
          })
        ),
      });

      if ((response.status === 429 || response.status === 529) && attempt < maxAttempts) {
        const waitMs = Math.min(10_000, 2_000 * Math.pow(2, attempt));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      if (!response.ok) {
        const err = await response.text();
        const errorCode = classifyAnthropicFailure(response.status, err);
        await logLlmProviderCall({
          provider: "anthropic",
          callKind: input.callKind,
          route: input.route,
          agent: input.agent,
          category: input.category ?? null,
          model: CLAUDE_WEB_SEARCH_MODEL,
          durationMs: Date.now() - startedAt,
          httpStatus: response.status,
          success: false,
          errorCode,
          errorMessage: err.slice(0, 500),
          correlationId: input.correlationId ?? null,
          ingestRunId: input.ingestRunId ?? null,
          metadata: {
            retryCount: attempt,
            maxTokens: input.maxTokens,
          },
        });
        if (errorCode === "anthropic_credits_exhausted") {
          captureMessage({
            level: "warning",
            message: "agent.ingest.anthropic_credits_exhausted",
            context: {
              category: input.category ?? "unknown",
              callKind: input.callKind,
              route: input.route,
              ingestRunId: input.ingestRunId ?? undefined,
            },
          });
          throw new Error(`Anthropic credits exhausted (HTTP ${response.status}): ${err}`);
        }
        throw new Error(`Claude API ${response.status}: ${err}`);
      }
      const data = (await response.json()) as Record<string, unknown>;
      const usage = readClaudeUsage(data, { input_tokens: 0, output_tokens: 0 });
      await logLlmProviderCall({
        provider: "anthropic",
        callKind: input.callKind,
        route: input.route,
        agent: input.agent,
        category: input.category ?? null,
        model: CLAUDE_WEB_SEARCH_MODEL,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        durationMs: Date.now() - startedAt,
        httpStatus: response.status,
        success: true,
        correlationId: input.correlationId ?? null,
        ingestRunId: input.ingestRunId ?? null,
        metadata: {
          retryCount: attempt,
          maxTokens: input.maxTokens,
        },
      });
      return { data, retryCount: attempt };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Claude API ")) {
        throw error;
      }
      if (attempt < maxAttempts) {
        const waitMs = Math.min(10_000, 1_000 * Math.pow(2, attempt));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      const message = error instanceof Error ? error.message : "anthropic_fetch_failed";
      await logLlmProviderCall({
        provider: "anthropic",
        callKind: input.callKind,
        route: input.route,
        agent: input.agent,
        category: input.category ?? null,
        model: CLAUDE_WEB_SEARCH_MODEL,
        durationMs: Date.now() - startedAt,
        success: false,
        errorCode: "fetch_exception",
        errorMessage: message.slice(0, 500),
        correlationId: input.correlationId ?? null,
        ingestRunId: input.ingestRunId ?? null,
        metadata: {
          retryCount: attempt,
          maxTokens: input.maxTokens,
        },
      });
      throw error;
    }
  }
  throw new Error("Claude API exhausted retries");
}

function parseJsonPayload(text: string): unknown {
  const cleaned = stripCodeFences(text);
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

function stripCodeFences(text: string): string {
  return text
    .split("```json")
    .join("")
    .split("```JSON")
    .join("")
    .split("```")
    .join("")
    .trim();
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
