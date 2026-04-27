import { getEnv } from "@/lib/env";
import { captureMessage } from "@/lib/observability";

const DEFAULT_DEEPL_URL = "https://api-free.deepl.com";

export interface DeepLTranslationInput {
  texts: string[];
  targetLang?: string;
  sourceLang?: string;
}

export interface DeepLTranslationOutput {
  texts: string[];
  detectedSourceLanguage: string | null;
  detectedSourceLanguages: string[];
}

interface DeepLResponseShape {
  translations?: Array<{
    text?: string;
    detected_source_language?: string;
  }>;
}

let hasWarnedDeepLEndpointMismatch = false;

function resolveDeepLApiHostname(endpointBase: string): string | null {
  const trimmed = endpointBase.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function maybeWarnDeepLEndpointMismatch(apiKey: string, endpointBase: string): void {
  if (hasWarnedDeepLEndpointMismatch) return;
  const isFreeStyleKey = apiKey.endsWith(":fx");
  const host = resolveDeepLApiHostname(endpointBase);
  if (!host) return;
  const endpointLooksFree = host === "api-free.deepl.com";
  const endpointLooksPro = host === "api.deepl.com";
  const mismatch =
    (isFreeStyleKey && endpointLooksPro) || (!isFreeStyleKey && endpointLooksFree);
  if (!mismatch) return;

  hasWarnedDeepLEndpointMismatch = true;
  captureMessage({
    level: "warning",
    message: "deepl.translate.endpoint_key_tier_mismatch",
    context: {
      keyTier: isFreeStyleKey ? "free" : "pro_or_unknown",
      endpointBase,
    },
  });
}

export async function translateTextsWithDeepL(
  input: DeepLTranslationInput
): Promise<DeepLTranslationOutput | null> {
  const env = getEnv();
  const apiKey = env.DEEPL_API_KEY?.trim();
  if (!apiKey) return null;

  const texts = input.texts.map((text) => text.trim());
  if (texts.length === 0 || texts.every((text) => text.length === 0)) {
    return null;
  }

  const endpointBase = (env.DEEPL_API_URL || DEFAULT_DEEPL_URL).replace(/\/+$/, "");
  maybeWarnDeepLEndpointMismatch(apiKey, endpointBase);
  const endpoint = `${endpointBase}/v2/translate`;
  const params = new URLSearchParams();
  params.set("target_lang", (input.targetLang || "EN").toUpperCase());
  params.set("preserve_formatting", "1");
  if (input.sourceLang?.trim()) params.set("source_lang", input.sourceLang.trim().toUpperCase());

  for (const text of texts) params.append("text", text);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `DeepL-Auth-Key ${apiKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      captureMessage({
        level: "warning",
        message: "deepl.translate.http_error",
        context: {
          status: response.status,
          bodySnippet: errorBody.slice(0, 180),
        },
      });
      return null;
    }

    const payload = (await response.json()) as DeepLResponseShape;
    const translations = payload.translations ?? [];
    if (translations.length === 0) return null;

    const translatedTexts = translations.map((entry, index) => entry.text ?? texts[index] ?? "");
    const detectedSourceLanguages = translations
      .map((entry) => entry.detected_source_language?.toUpperCase() ?? "")
      .filter((language) => language.length > 0);
    const detectedSourceLanguage =
      detectedSourceLanguages[0] ?? null;

    return {
      texts: translatedTexts,
      detectedSourceLanguage,
      detectedSourceLanguages,
    };
  } catch (error: unknown) {
    captureMessage({
      level: "warning",
      message: "deepl.translate.request_failed",
      context: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}
