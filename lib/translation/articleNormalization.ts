import { db } from "@/lib/db/client";
import { buildHeadlineFingerprint } from "@/lib/articles/dedup-keys";
import { captureException, captureMessage } from "@/lib/observability";
import { translateTextsWithDeepL } from "@/lib/translation/deepl";
import {
  detectLikelyNonEnglishText,
  isLikelyEnglishLocale,
} from "@/lib/translation/languageHeuristics";

interface TranslationCandidateRow {
  id: string;
  category: string;
  headline: string;
  subheadline: string | null;
  body: string;
  pull_quote: string | null;
  image_prompt: string | null;
  locale: string | null;
  original_headline: string | null;
  original_subheadline: string | null;
  original_body: string | null;
  translated_at: string | null;
  source_language: string | null;
}

export interface RunArticleTranslationNormalizationInput {
  maxRows?: number;
  scanLimit?: number;
  articleIds?: string[];
  apply?: boolean;
  reason?: string;
  forceOnArticleIds?: boolean;
}

export interface RunArticleTranslationNormalizationResult {
  scanned: number;
  candidates: number;
  translated: number;
  skipped: number;
  unavailableCount: number;
  failures: number;
}

const DEFAULT_SCAN_LIMIT = 1200;
const DEFAULT_MAX_ROWS = 80;
const MAX_FIELD_CHARS = 45_000;

function trimField(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, MAX_FIELD_CHARS);
}

function normalizeForChangeCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasMeaningfulTranslationChange(inputs: string[], outputs: string[]): boolean {
  const max = Math.max(inputs.length, outputs.length);
  for (let index = 0; index < max; index += 1) {
    const source = normalizeForChangeCompare(inputs[index] ?? "");
    const translated = normalizeForChangeCompare(outputs[index] ?? "");
    if (!source || !translated) continue;
    if (source !== translated) return true;
  }
  return false;
}

function buildCandidateProbe(row: TranslationCandidateRow): string {
  return [row.headline, row.subheadline ?? "", row.body, row.pull_quote ?? "", row.image_prompt ?? ""]
    .filter(Boolean)
    .join(" ")
    .slice(0, 3000);
}

function localeSuggestsNonEnglish(locale: string | null): boolean {
  if (!locale) return false;
  return !isLikelyEnglishLocale(locale);
}

function shouldTranslateCandidate(row: TranslationCandidateRow): boolean {
  if (row.translated_at) return false;
  const localeFlag = localeSuggestsNonEnglish(row.locale);
  const heuristic = detectLikelyNonEnglishText(buildCandidateProbe(row));
  return localeFlag || heuristic.likelyNonEnglish;
}

async function fetchCandidateRows(input: RunArticleTranslationNormalizationInput): Promise<TranslationCandidateRow[]> {
  if (input.articleIds && input.articleIds.length > 0) {
    const { data, error } = await db
      .from("articles")
      .select(
        "id,category,headline,subheadline,body,pull_quote,image_prompt,locale,original_headline,original_subheadline,original_body,translated_at,source_language"
      )
      .in("id", input.articleIds)
      .eq("source", "ingest")
      .eq("content_kind", "news")
      .is("deleted_at", null);
    if (error) throw new Error(`fetchCandidateRows(articleIds): ${error.message}`);
    return (data ?? []) as TranslationCandidateRow[];
  }

  const scanLimit = Math.max(1, input.scanLimit ?? DEFAULT_SCAN_LIMIT);
  const { data, error } = await db
    .from("articles")
    .select(
      "id,category,headline,subheadline,body,pull_quote,image_prompt,locale,original_headline,original_subheadline,original_body,translated_at,source_language"
    )
    .eq("source", "ingest")
    .eq("content_kind", "news")
    .is("deleted_at", null)
    .order("fetched_at", { ascending: false })
    .limit(scanLimit);
  if (error) throw new Error(`fetchCandidateRows(scan): ${error.message}`);
  return (data ?? []) as TranslationCandidateRow[];
}

export async function runArticleTranslationNormalization(
  input: RunArticleTranslationNormalizationInput = {}
): Promise<RunArticleTranslationNormalizationResult> {
  const apply = input.apply ?? true;
  const maxRows = Math.max(1, input.maxRows ?? DEFAULT_MAX_ROWS);
  const rows = await fetchCandidateRows(input);
  const filtered = rows.filter((row) => {
    if (input.forceOnArticleIds && input.articleIds?.length) return !row.translated_at;
    return shouldTranslateCandidate(row);
  });
  const candidates = filtered.slice(0, maxRows);

  const result: RunArticleTranslationNormalizationResult = {
    scanned: rows.length,
    candidates: filtered.length,
    translated: 0,
    skipped: 0,
    unavailableCount: 0,
    failures: 0,
  };

  for (const row of candidates) {
    const sourceTexts = [
      trimField(row.headline),
      trimField(row.subheadline),
      trimField(row.body),
      trimField(row.pull_quote),
      trimField(row.image_prompt),
    ];
    try {
      const deepl = await translateTextsWithDeepL({
        texts: sourceTexts,
        targetLang: "EN",
      });
      if (!deepl) {
        result.unavailableCount += 1;
        continue;
      }

      const translatedTexts = deepl.texts.map((value, index) =>
        trimField(value) || sourceTexts[index] || ""
      );
      const hasMeaningfulChange = hasMeaningfulTranslationChange(sourceTexts, translatedTexts);
      if (!hasMeaningfulChange) {
        result.skipped += 1;
        continue;
      }

      const sourceLanguage =
        deepl.detectedSourceLanguage?.toUpperCase() ??
        deepl.detectedSourceLanguages[0]?.toUpperCase() ??
        row.source_language ??
        null;
      if (apply) {
        const translatedHeadline = translatedTexts[0] ?? sourceTexts[0];
        const translatedSubheadline = translatedTexts[1] ?? sourceTexts[1];
        const translatedBody = translatedTexts[2] ?? sourceTexts[2];
        const translatedPullQuote = translatedTexts[3] ?? sourceTexts[3];
        const translatedImagePrompt = translatedTexts[4] ?? sourceTexts[4];
        const { error: updateError } = await db
          .from("articles")
          .update({
            headline: translatedHeadline,
            subheadline: translatedSubheadline || "",
            body: translatedBody,
            pull_quote: translatedPullQuote || "",
            image_prompt: translatedImagePrompt || "",
            original_headline: row.original_headline ?? sourceTexts[0],
            original_subheadline: row.original_subheadline ?? sourceTexts[1],
            original_body: row.original_body ?? sourceTexts[2],
            translated_at: new Date().toISOString(),
            translation_provider: "deepl",
            source_language: sourceLanguage,
            fingerprint: buildHeadlineFingerprint(translatedHeadline, row.category),
          })
          .eq("id", row.id);
        if (updateError) throw new Error(`update ${row.id}: ${updateError.message}`);
      }

      result.translated += 1;
      captureMessage({
        level: "info",
        message: "article.translation.normalized",
        context: {
          articleId: row.id,
          sourceLanguage,
          reason: input.reason ?? "normalization",
          apply,
        },
      });
    } catch (error: unknown) {
      result.failures += 1;
      captureException(error, {
        route: "lib/translation/articleNormalization",
        articleId: row.id,
        reason: input.reason ?? "normalization",
      });
    }
  }

  captureMessage({
    level: "info",
    message: "article.translation.normalization.summary",
    context: {
      scanned: result.scanned,
      candidates: result.candidates,
      translated: result.translated,
      skipped: result.skipped,
      unavailable: result.unavailableCount,
      failures: result.failures,
      reason: input.reason ?? "normalization",
      apply,
    },
  });
  return result;
}
