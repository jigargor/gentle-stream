import { getEnv } from "@/lib/env";

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

  const endpoint = `${(env.DEEPL_API_URL || DEFAULT_DEEPL_URL).replace(/\/+$/, "")}/v2/translate`;
  const params = new URLSearchParams();
  params.set("target_lang", (input.targetLang || "EN").toUpperCase());
  params.set("preserve_formatting", "1");
  if (input.sourceLang?.trim()) params.set("source_lang", input.sourceLang.trim().toUpperCase());

  for (const text of texts) params.append("text", text);

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
    const body = await response.text().catch(() => "");
    throw new Error(`DeepL translate failed: ${response.status} ${body.slice(0, 180)}`);
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
}
