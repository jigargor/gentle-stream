import type { CreatorModelMode } from "@/lib/db/creatorStudio";
import type { LlmGenerateTextResult, LlmProvider } from "@/lib/llm/client";
import { getProviderCapabilities } from "@/lib/llm/provider-capabilities";
import {
  buildFallbackDiagnosis,
  type AssistDiagnosis,
  parseAssistDiagnosisPayload,
} from "@/lib/creator/assist-structured-output";

export interface AssistDiagnosisRequestInput {
  mode: CreatorModelMode;
  headline: string;
  body: string;
  selectedText?: string;
  context?: string;
}

export interface AssistOutputAdapter {
  provider: LlmProvider;
  buildPrompt(input: AssistDiagnosisRequestInput): string;
  parseOutput(
    output: LlmGenerateTextResult,
    mode: CreatorModelMode,
    fallbackHeadline: string
  ): AssistDiagnosis;
}

function buildCommonJsonInstruction(): string {
  return [
    "Return only valid JSON matching this exact shape:",
    "{",
    '  "schemaVersion": "1.0",',
    '  "responseType": "diagnosis",',
    '  "summary": "short summary",',
    '  "suggestions": [',
    '    { "id": "s1", "title": "...", "detail": "1-2 sentences", "lengthHint": "short" },',
    '    { "id": "s2", "title": "...", "detail": "1-2 sentences", "lengthHint": "short" },',
    '    { "id": "s3", "title": "...", "detail": "longer guidance paragraph", "lengthHint": "long" }',
    "  ],",
    '  "openingAngles": [ "Paste-ready hook line 1", "Paste-ready hook line 2" ],',
    '  "providerMeta": { "provider": "anthropic|openai|gemini", "model": "string", "mode": "manual|auto|max" }',
    "}",
    "openingAngles: 2–6 short standalone lines (questions or hooks) the writer can paste; do not paste the full analysis there.",
    "Do not include markdown fences.",
  ].join("\n");
}

function parseWithFallback(
  output: LlmGenerateTextResult,
  mode: CreatorModelMode,
  fallbackHeadline: string
): AssistDiagnosis {
  try {
    return parseAssistDiagnosisPayload(output.text);
  } catch {
    return buildFallbackDiagnosis({
      provider: output.provider,
      model: output.model,
      mode,
      draftHeadline: fallbackHeadline,
    });
  }
}

function buildPromptWithCapabilities(
  provider: LlmProvider,
  input: AssistDiagnosisRequestInput
): string {
  const caps = getProviderCapabilities(provider);
  const formatHint = caps.supportsJsonSchemaResponseFormat
    ? "Use strict schema-style JSON output."
    : caps.requiresPromptOnlyJsonFallback
      ? "JSON must be prompt-constrained; ensure exact field names."
      : "Return standards-compliant JSON.";
  return [
    "You are a writing diagnosis assistant.",
    formatHint,
    buildCommonJsonInstruction(),
    `Headline: ${input.headline || "(none)"}`,
    `Draft excerpt: ${(input.body || "").slice(0, 1800)}`,
    input.selectedText ? `Selected excerpt: ${input.selectedText}` : "",
    input.context ? `Extra context: ${input.context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function createAdapter(provider: LlmProvider): AssistOutputAdapter {
  return {
    provider,
    buildPrompt(input) {
      return buildPromptWithCapabilities(provider, input);
    },
    parseOutput(output, mode, fallbackHeadline) {
      return parseWithFallback(output, mode, fallbackHeadline);
    },
  };
}

export const assistOutputAdapters: Record<LlmProvider, AssistOutputAdapter> = {
  anthropic: createAdapter("anthropic"),
  openai: createAdapter("openai"),
  gemini: createAdapter("gemini"),
};
