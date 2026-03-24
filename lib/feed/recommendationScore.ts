import type { Category } from "@/lib/constants";
import { DEFAULT_CATEGORY_WEIGHTS } from "@/lib/constants";
import type { StoredArticle, UserProfile } from "@/lib/types";
import type { UserAffinityRow } from "@/lib/db/engagement";

export function buildAffinityIndex(rows: UserAffinityRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const category = String(row.category ?? "").trim();
    if (!category) continue;
    const locale = String(row.locale ?? "global").trim() || "global";
    const score = Number.isFinite(row.affinity_score) ? row.affinity_score : 0;
    map.set(`${category}|${locale}`, score);
  }
  return map;
}

export function scoreArticleWithEngagement(
  article: StoredArticle,
  profile: UserProfile,
  affinityIndex: Map<string, number>
): number {
  const base = article.qualityScore;
  const categoryWeight =
    profile.categoryWeights[article.category as Category] ??
    DEFAULT_CATEGORY_WEIGHTS[article.category as Category] ??
    0.125;

  const emotionBoost = emotionMatch(article.emotions, profile.preferredEmotions);
  const localeBoost = localeMatch(article.locale, profile.preferredLocales);
  const freshness = freshnessFactor(article.fetchedAt);
  const novelty = noveltyPenalty(article.usedCount);
  const engagement = engagementBoost(article, affinityIndex);

  return (
    base *
    categoryWeight *
    8 *
    emotionBoost *
    localeBoost *
    freshness *
    novelty *
    engagement
  );
}

function engagementBoost(
  article: StoredArticle,
  affinityIndex: Map<string, number>
): number {
  if (affinityIndex.size === 0) return 1.0;
  const locale = article.locale || "global";
  const exact = affinityIndex.get(`${article.category}|${locale}`) ?? null;
  const global = affinityIndex.get(`${article.category}|global`) ?? null;
  const raw = exact ?? global;
  if (raw == null) return 0.95;
  // Compress to stable multiplier range [0.85, 1.35]
  const normalized = raw / (Math.abs(raw) + 6);
  return 1 + normalized * 0.5;
}

function emotionMatch(articleEmotions: string[], preferred: string[]): number {
  if (preferred.length === 0) return 1.0;
  const match = articleEmotions.some((e) => preferred.includes(e));
  return match ? 1.3 : 0.85;
}

function localeMatch(articleLocale: string, preferred: string[]): number {
  if (preferred.length === 0 || preferred.includes("global")) return 1.0;
  if (preferred.includes(articleLocale) || articleLocale === "global") return 1.2;
  return 0.8;
}

function freshnessFactor(fetchedAt: string): number {
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.max(0.3, 1.0 - ageDays * 0.1);
}

function noveltyPenalty(usedCount: number): number {
  if (usedCount < 10) return 1.0;
  if (usedCount < 50) return 0.85;
  return 0.6;
}

