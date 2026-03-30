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

import { getUntaggedArticles, updateArticleTags } from "../db/articles";
import type { StoredArticle } from "../types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

interface TaggerEnrichment {
  tags: string[];
  sentiment: StoredArticle["sentiment"];
  emotions: string[];
  locale: string;
  readingTimeSecs: number;
  qualityScore: number;
}

/**
 * Process all untagged articles in the DB (up to `limit` per run).
 */
export async function runTaggerAgent(limit = 20): Promise<void> {
  const articles = await getUntaggedArticles(limit);
  if (articles.length === 0) {
    console.log("[TaggerAgent] No untagged articles found.");
    return;
  }

  console.log(`[TaggerAgent] Tagging ${articles.length} articles...`);

  // Process in parallel — no web search, so rate limits are relaxed
  await Promise.allSettled(articles.map(tagSingleArticle));
}

async function tagSingleArticle(article: StoredArticle): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = buildTaggerPrompt(article);

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
    console.error(`[TaggerAgent] API error for article ${article.id}: ${response.status}`);
    return;
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) return;

  try {
    const raw = textBlock.text.replace(/```json|```/g, "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const enrichment: TaggerEnrichment = JSON.parse(raw.slice(start, end + 1));

    await updateArticleTags(article.id, {
      tags: enrichment.tags ?? [],
      sentiment: enrichment.sentiment ?? "uplifting",
      emotions: enrichment.emotions ?? [],
      locale: enrichment.locale ?? "global",
      readingTimeSecs: article.readingTimeSecs, // already estimated by ingest
      qualityScore: clamp(enrichment.qualityScore ?? 0.5),
    });

    console.log(`[TaggerAgent] Tagged article ${article.id}: score=${enrichment.qualityScore}`);
  } catch (e) {
    console.error(`[TaggerAgent] Parse error for article ${article.id}:`, e);
  }
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

  return `Classify this ${classifyLabel}. Return raw JSON only, no markdown.

Headline: ${article.headline}
Category: ${article.category}
Content kind: ${contentKind}
Body: ${article.body.slice(0, 800)}
${explicitTagLine}

Return exactly:
{
  "tags": ["3 to 8 specific topic tags, lowercase, include all author-supplied tags if present"],
  "sentiment": "uplifting" | "inspiring" | "heartwarming" | "triumphant",
  "emotions": ["1 to 3 emotions from: joy, awe, hope, pride, gratitude, wonder, excitement"],
  "locale": "global" | "US" | "UK" | "AU" | "EU" | "Asia" | "Africa" | "LatAm",
  "qualityScore": 0.0 to 1.0 (how compelling, specific, and well-written is this story?)
}`;
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, n));
}
