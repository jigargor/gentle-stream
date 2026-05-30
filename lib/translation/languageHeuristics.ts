import { looksLikelyNonEnglishText } from "@/lib/articles/languageHeuristics";

const SPANISH_MARKER_REGEX =
  /\b(el|la|los|las|de|del|que|y|en|un|una|por|para|con|como|más|pero|sus|también|desde|hasta|sobre)\b/gi;
const NON_ASCII_PUNCT_REGEX = /[¿¡]/g;
const DIACRITIC_REGEX = /[áéíóúñüàèìòùâêîôûçãõ]/gi;

function normalizeProbeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function countMatches(pattern: RegExp, input: string): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

export interface LanguageHeuristicResult {
  likelyNonEnglish: boolean;
  guessedSourceLanguage: string | null;
  score: number;
}

/**
 * Cheap non-English detector used to prioritize translation candidates.
 * It intentionally over-indexes on Spanish because that is the known failure mode.
 */
export function detectLikelyNonEnglishText(input: string): LanguageHeuristicResult {
  const text = normalizeProbeText(input);
  if (text.length < 32) {
    return { likelyNonEnglish: false, guessedSourceLanguage: null, score: 0 };
  }

  const markerCount = countMatches(SPANISH_MARKER_REGEX, text.toLowerCase());
  const punctCount = countMatches(NON_ASCII_PUNCT_REGEX, text);
  const diacriticCount = countMatches(DIACRITIC_REGEX, text);
  const score = markerCount + punctCount * 2 + diacriticCount;
  const likelySpanish = score >= 5 || (markerCount >= 3 && text.length >= 120);
  const likelyGeneralNonEnglish = looksLikelyNonEnglishText(text);
  const likelyNonEnglish = likelySpanish || likelyGeneralNonEnglish;

  return {
    likelyNonEnglish,
    guessedSourceLanguage: likelySpanish ? "ES" : likelyNonEnglish ? "UNKNOWN" : null,
    score,
  };
}

export function isLikelyEnglishLocale(localeRaw: string | null | undefined): boolean {
  const locale = (localeRaw ?? "").trim().toUpperCase();
  if (!locale) return true;
  const knownEnglishishLocales = new Set([
    "GLOBAL",
    "US",
    "UK",
    "EN",
    "EN-US",
    "EN-GB",
    "CA",
    "AU",
    "NZ",
    "IE",
  ]);
  return knownEnglishishLocales.has(locale);
}
