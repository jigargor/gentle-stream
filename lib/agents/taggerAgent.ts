/**
 * Tagger Agent
 *
 * Takes a raw article (already in the DB, tagged=false) and calls Claude
 * WITHOUT web search to classify it — cheap, fast, no search quota used.
 *
 * Adds:  tags[], sentiment, emotions[], locale, readingTimeSecs, qualityScore
 * Sets:  tagged = true
 *
 * Called by: app/api/cron/tagger/route.ts
 */

import { getArticleById, getUntaggedArticles, updateArticleTags } from "../db/articles";
import type { StoredArticle } from "../types";
import { captureException, captureMessage, startSpan } from "@/lib/observability";
import { logLlmProviderCall } from "@/lib/db/llmProviderCalls";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const AUTO_REJECT_MIN_CONFIDENCE = 0.88;

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

/** Outcome of classifying a single article (exported for ingest CLI sequencing). */
export type TagSingleOutcome =
  | "tagged"
  | "skipped_already_tagged"
  | "not_found"
  | "api_error"
  | "credits_exhausted"
  | "parse_error";

interface TaggerEnrichment {
  tags: string[];
  sentiment: StoredArticle["sentiment"];
  emotions: string[];
  locale: string;
  readingTimeSecs: number;
  qualityScore: number;
  moderation?: {
    isPolitical?: boolean;
    politicalScope?: "none" | "civic_policy" | "elected_official" | "campaign_election" | "geopolitics";
    action?: "approve" | "flag_for_review" | "reject";
    confidence?: number;
    rationale?: string;
    reasons?: string[];
  };
}

/**
 * Process all untagged articles in the DB (up to `limit` per run).
 */
export async function runTaggerAgent(limit = 20): Promise<void> {
  const span = startSpan("agent.tagger", { limit });
  const articles = await getUntaggedArticles(limit);
  if (articles.length === 0) {
    console.log("[TaggerAgent] No untagged articles found.");
    span.end({ processed: 0 });
    return;
  }

  console.log(`[TaggerAgent] Tagging ${articles.length} articles...`);

  await Promise.allSettled(articles.map((a) => tagSingleArticle(a)));
  span.end({ processed: articles.length });
}

async function tagSingleArticle(article: StoredArticle): Promise<TagSingleOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  if (article.tagged) return "skipped_already_tagged";

  const prompt = buildTaggerPrompt(article);
  const startedAt = Date.now();

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    const creditsExhausted =
      response.status === 429 && messageLooksLikeCreditExhaustion(responseText);
    await logLlmProviderCall({
      provider: "anthropic",
      callKind: "tagger_classification",
      route: "lib/agents/taggerAgent",
      agent: "tagger",
      category: article.category,
      model: "claude-sonnet-4-20250514",
      durationMs: Date.now() - startedAt,
      httpStatus: response.status,
      success: false,
      errorCode: `http_${response.status}`,
      errorMessage: responseText.slice(0, 500),
      correlationId: article.id,
    });
    console.error(`[TaggerAgent] API error for article ${article.id}: ${response.status}`);
    captureException(new Error(`tagger_api_${response.status}`), {
      agent: "tagger",
      articleId: article.id,
      status: response.status,
    });
    return creditsExhausted ? "credits_exhausted" : "api_error";
  }

  const data = await response.json();
  const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  await logLlmProviderCall({
    provider: "anthropic",
    callKind: "tagger_classification",
    route: "lib/agents/taggerAgent",
    agent: "tagger",
    category: article.category,
    model: "claude-sonnet-4-20250514",
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    durationMs: Date.now() - startedAt,
    httpStatus: response.status,
    success: true,
    correlationId: article.id,
  });
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) return "parse_error";

  try {
    const raw = textBlock.text.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const enrichment: TaggerEnrichment = JSON.parse(raw.slice(start, end + 1));

    const moderation = resolveModerationDecision(enrichment);
    await updateArticleTags(article.id, {
      tags: enrichment.tags ?? [],
      sentiment: enrichment.sentiment ?? "uplifting",
      emotions: enrichment.emotions ?? [],
      locale: enrichment.locale ?? "global",
      readingTimeSecs: article.readingTimeSecs, // already estimated by ingest
      qualityScore: clamp(enrichment.qualityScore ?? 0.5),
      moderation,
    });

    captureMessage({
      level: "info",
      message: "agent.tagger.moderation_applied",
      context: {
        articleId: article.id,
        moderationStatus: moderation.status,
        moderationConfidence: moderation.confidence,
      },
    });
    console.log(`[TaggerAgent] Tagged article ${article.id}: score=${enrichment.qualityScore}`);
    return "tagged";
  } catch (e) {
    console.error(`[TaggerAgent] Parse error for article ${article.id}:`, e);
    captureException(e, { agent: "tagger", articleId: article.id, phase: "parse" });
    return "parse_error";
  }
}

/**
 * Load one article by id and run the tagger (sequential ingest scripts).
 * Does not batch; use this when you must tag before the next ingest step.
 */
export async function tagArticleById(articleId: string): Promise<TagSingleOutcome> {
  const article = await getArticleById(articleId);
  if (!article) return "not_found";
  if (article.tagged) return "skipped_already_tagged";
  return tagSingleArticle(article);
}

export function resolveModerationDecision(enrichment: TaggerEnrichment): {
  status: "approved" | "flagged" | "rejected";
  reason: string | null;
  confidence: number | null;
  labels: Record<string, unknown>;
} {
  const moderation = enrichment.moderation;
  const confidenceRaw =
    moderation?.confidence == null || Number.isNaN(moderation.confidence)
      ? null
      : clamp(moderation.confidence);
  const action =
    moderation?.action === "reject" ||
    moderation?.action === "flag_for_review" ||
    moderation?.action === "approve"
      ? moderation.action
      : "approve";
  const resolvedStatus =
    action === "reject"
      ? confidenceRaw != null && confidenceRaw >= AUTO_REJECT_MIN_CONFIDENCE
        ? "rejected"
        : "flagged"
      : action === "flag_for_review"
        ? "flagged"
        : "approved";
  const reason = (moderation?.rationale ?? "").trim() || null;

  return {
    status: resolvedStatus,
    reason,
    confidence: confidenceRaw,
    labels: {
      isPolitical: moderation?.isPolitical ?? null,
      politicalScope: moderation?.politicalScope ?? null,
      action: moderation?.action ?? null,
      reasons: moderation?.reasons ?? [],
      autoRejectMinConfidence: AUTO_REJECT_MIN_CONFIDENCE,
    },
  };
}

function buildTaggerPrompt(article: StoredArticle): string {
  const explicitTags = (article.creatorExplicitTags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const explicitTagLine =
    explicitTags.length > 0
      ? `Author-supplied tags (must all appear in "tags"): ${explicitTags.join(", ")}`
      : "Author-supplied tags: none";
  const contentKind = article.contentKind ?? (article.source === "creator" ? "user_article" : "news");
  const classifyLabel =
    contentKind === "recipe"
      ? "recipe"
      : contentKind === "user_article"
        ? "user-written article"
        : "news article";

  const categoryLine =
    contentKind === "recipe"
      ? "Recipes are not assigned editorial categories."
      : `Category: ${article.category}`;

  return `Classify this ${classifyLabel}. Return raw JSON only, no markdown.

Headline: ${article.headline}
${categoryLine}
Content kind: ${contentKind}
Body: ${article.body.slice(0, 800)}
${explicitTagLine}

Return exactly:
{
  "tags": ["3 to 8 specific topic tags, lowercase, include all author-supplied tags if present"],
  "sentiment": "uplifting" | "inspiring" | "heartwarming" | "triumphant",
  "emotions": ["1 to 3 emotions from: joy, awe, hope, pride, gratitude, wonder, excitement"],
  "locale": "global" | "US" | "UK" | "AU" | "EU" | "Asia" | "Africa" | "LatAm",
  "qualityScore": 0.0 to 1.0 (how compelling, specific, and well-written is this story?),
  "moderation": {
    "isPolitical": true | false,
    "politicalScope": "none" | "civic_policy" | "elected_official" | "campaign_election" | "geopolitics",
    "action": "approve" | "flag_for_review" | "reject",
    "confidence": 0.0 to 1.0,
    "rationale": "short plain-language reason for admin review",
    "reasons": ["0 to 4 short labels explaining the decision"]
  }
}`;
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}
