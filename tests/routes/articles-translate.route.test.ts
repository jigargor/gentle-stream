import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const translateTextsWithDeepLMock = vi.fn();
const captureMessageMock = vi.fn();

vi.mock("@/lib/translation/deepl", () => ({
  translateTextsWithDeepL: translateTextsWithDeepLMock,
}));

vi.mock("@/lib/observability", () => ({
  captureMessage: captureMessageMock,
}));

interface TranslatePayload {
  articleId: string;
  headline: string;
  subheadline: string;
  body: string;
  pullQuote: string;
  imagePrompt: string;
}

const basePayload: TranslatePayload = {
  articleId: "article-1",
  headline: "Titular en espanol",
  subheadline: "subtitulo en espanol",
  body: "Contenido narrativo en espanol con mas texto para prueba.",
  pullQuote: "Una cita destacada",
  imagePrompt: "Plaza de mercado al amanecer",
};

async function runTranslateRequest(payload: Partial<TranslatePayload> = {}) {
  const { POST } = await import("@/app/api/articles/translate/route");
  const request = new NextRequest("http://localhost/api/articles/translate", {
    method: "POST",
    body: JSON.stringify({
      ...basePayload,
      ...payload,
    }),
    headers: { "content-type": "application/json" },
  });
  return POST(request);
}

describe("/api/articles/translate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("marks translated when DeepL reports non-English source language", async () => {
    translateTextsWithDeepLMock.mockResolvedValue({
      texts: [
        "Headline in English",
        "Subheadline in English",
        "Body in English",
        "Pull quote in English",
        "Town square at dawn",
      ],
      detectedSourceLanguage: "es",
      detectedSourceLanguages: ["ES", "ES", "ES", "ES", "ES"],
    });

    const response = await runTranslateRequest();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      translated: true,
      detectedSourceLanguage: "ES",
      headline: "Headline in English",
      pullQuote: "Pull quote in English",
      imagePrompt: "Town square at dawn",
    });
  });

  it("marks translated when DeepL changes text but omits source language", async () => {
    translateTextsWithDeepLMock.mockResolvedValue({
      texts: [
        "Headline translated",
        "Subheadline translated",
        "Body translated",
        "Pull quote translated",
        "Prompt translated",
      ],
      detectedSourceLanguage: null,
      detectedSourceLanguages: [],
    });

    const response = await runTranslateRequest();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      translated: true,
      detectedSourceLanguage: null,
      headline: "Headline translated",
      body: "Body translated",
      pullQuote: "Pull quote translated",
      imagePrompt: "Prompt translated",
    });
  });

  it("keeps original text when DeepL reports English-only source", async () => {
    const englishPayload = {
      headline: "The city council approved a new budget",
      subheadline: "Officials expect lower deficits next year",
      body: "Residents attended the hearing and asked for more transit funding.",
      pullQuote: "This budget is about public trust.",
      imagePrompt: "City hall meeting room",
    };

    translateTextsWithDeepLMock.mockResolvedValue({
      texts: [
        englishPayload.headline,
        englishPayload.subheadline,
        englishPayload.body,
        englishPayload.pullQuote,
        englishPayload.imagePrompt,
      ],
      detectedSourceLanguage: "EN",
      detectedSourceLanguages: ["EN", "EN", "EN", "EN", "EN"],
    });

    const response = await runTranslateRequest(englishPayload);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      translated: false,
      detectedSourceLanguage: "EN",
      headline: englishPayload.headline,
      body: englishPayload.body,
      pullQuote: englishPayload.pullQuote,
      imagePrompt: englishPayload.imagePrompt,
    });
  });

  it("marks translated when DeepL text changes despite English source labels", async () => {
    translateTextsWithDeepLMock.mockResolvedValue({
      texts: [
        "English rewritten headline",
        "English rewritten subheadline",
        "English rewritten body with clearer language.",
        "A rewritten pull quote.",
        "Sunrise over city skyline",
      ],
      detectedSourceLanguage: "EN",
      detectedSourceLanguages: ["EN", "EN", "EN", "EN", "EN"],
    });

    const response = await runTranslateRequest();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      available: true,
      translated: true,
      detectedSourceLanguage: "EN",
      headline: "English rewritten headline",
      body: "English rewritten body with clearer language.",
    });
  });

  it("does not negative-cache unavailable DeepL responses", async () => {
    translateTextsWithDeepLMock.mockResolvedValue(null);

    const first = await runTranslateRequest();
    const second = await runTranslateRequest();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(translateTextsWithDeepLMock).toHaveBeenCalledTimes(2);
    await expect(first.json()).resolves.toMatchObject({
      available: false,
      translated: false,
    });
  });
});
