import { NextRequest, NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureMessage } from "@/lib/observability";
import { translateTextsWithDeepL } from "@/lib/translation/deepl";

interface TranslateArticleRequestBody {
  articleId?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  pullQuote?: string;
  imagePrompt?: string;
}

interface TranslateArticleResponseBody {
  available: boolean;
  translated: boolean;
  detectedSourceLanguage: string | null;
  headline: string;
  subheadline: string;
  body: string;
  pullQuote: string;
  imagePrompt: string;
}

const MAX_FIELD_CHARS = 45_000;
const translationCache = new Map<string, TranslateArticleResponseBody>();

function trimField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildCacheKey(input: {
  articleId: string;
  headline: string;
  subheadline: string;
  body: string;
  pullQuote: string;
  imagePrompt: string;
}): string {
  return [
    input.articleId,
    input.headline.slice(0, 160),
    input.subheadline.slice(0, 160),
    input.body.slice(0, 320),
    input.pullQuote.slice(0, 120),
    input.imagePrompt.slice(0, 120),
    input.headline.length,
    input.subheadline.length,
    input.body.length,
    input.pullQuote.length,
    input.imagePrompt.length,
  ].join("|");
}

function normalizeForChangeCompare(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasLikelyTranslationChange(inputs: string[], outputs: string[]): boolean {
  const max = Math.max(inputs.length, outputs.length);
  for (let index = 0; index < max; index += 1) {
    const source = normalizeForChangeCompare(inputs[index] ?? "");
    const translated = normalizeForChangeCompare(outputs[index] ?? "");
    if (!source || !translated) continue;
    if (source !== translated) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  let payload: TranslateArticleRequestBody;
  try {
    payload = (await request.json()) as TranslateArticleRequestBody;
  } catch {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Expected a JSON request body.",
    });
  }

  const articleId = trimField(payload.articleId) || "ad-hoc";
  const headline = trimField(payload.headline).slice(0, MAX_FIELD_CHARS);
  const subheadline = trimField(payload.subheadline).slice(0, MAX_FIELD_CHARS);
  const body = trimField(payload.body).slice(0, MAX_FIELD_CHARS);
  const pullQuote = trimField(payload.pullQuote).slice(0, MAX_FIELD_CHARS);
  const imagePrompt = trimField(payload.imagePrompt).slice(0, MAX_FIELD_CHARS);

  if (!headline && !subheadline && !body && !pullQuote && !imagePrompt) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "At least one article field is required.",
    });
  }

  const cacheKey = buildCacheKey({
    articleId,
    headline,
    subheadline,
    body,
    pullQuote,
    imagePrompt,
  });
  const cached = translationCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const sourceTexts = [headline, subheadline, body, pullQuote, imagePrompt];
    const deepl = await translateTextsWithDeepL({
      texts: sourceTexts,
      targetLang: "EN",
    });

    if (!deepl) {
      captureMessage({
        level: "warning",
        message: "article.translate.unavailable",
        context: { route: "/api/articles/translate", articleId },
      });
      return NextResponse.json({
        available: false,
        translated: false,
        detectedSourceLanguage: null,
        headline,
        subheadline,
        body,
        pullQuote,
        imagePrompt,
      } satisfies TranslateArticleResponseBody);
    }

    const translatedHeadline = deepl.texts[0] ?? headline;
    const translatedSubheadline = deepl.texts[1] ?? subheadline;
    const translatedBody = deepl.texts[2] ?? body;
    const translatedPullQuote = deepl.texts[3] ?? pullQuote;
    const translatedImagePrompt = deepl.texts[4] ?? imagePrompt;
    const sourceLanguage = deepl.detectedSourceLanguage?.toUpperCase() ?? null;
    const perFieldLanguages = deepl.detectedSourceLanguages.map((language) => language.toUpperCase());
    const hasAnyLanguageSignal = perFieldLanguages.length > 0;
    const hasNonEnglishSignal = perFieldLanguages.some((language) => !language.startsWith("EN"));
    const hasEnglishOnlySignal =
      hasAnyLanguageSignal && perFieldLanguages.every((language) => language.startsWith("EN"));
    const translatedTexts = [
      translatedHeadline,
      translatedSubheadline,
      translatedBody,
      translatedPullQuote,
      translatedImagePrompt,
    ];
    const hasTextChanged = hasLikelyTranslationChange(sourceTexts, translatedTexts);
    const translated = hasNonEnglishSignal || (!hasEnglishOnlySignal && hasTextChanged);

    if (!translated && hasTextChanged) {
      captureMessage({
        level: "warning",
        message: "article.translate.skipped_after_deepl",
        context: {
          route: "/api/articles/translate",
          articleId,
          sourceLanguage,
          perFieldLanguages: perFieldLanguages.join(","),
          hasAnyLanguageSignal,
          hasEnglishOnlySignal,
        },
      });
    }

    const out: TranslateArticleResponseBody = {
      available: true,
      translated,
      detectedSourceLanguage: sourceLanguage,
      headline: translated ? translatedHeadline : headline,
      subheadline: translated ? translatedSubheadline : subheadline,
      body: translated ? translatedBody : body,
      pullQuote: translated ? translatedPullQuote : pullQuote,
      imagePrompt: translated ? translatedImagePrompt : imagePrompt,
    };
    translationCache.set(cacheKey, out);
    if (translationCache.size > 300) {
      const oldest = translationCache.keys().next().value as string | undefined;
      if (oldest) translationCache.delete(oldest);
    }
    return NextResponse.json(out);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not translate article.";
    return apiErrorResponse({
      request,
      status: 502,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
