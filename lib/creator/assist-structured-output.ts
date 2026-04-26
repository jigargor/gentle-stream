import { z } from "zod";
import type { CreatorModelMode } from "@/lib/db/creatorStudio";
import type { LlmProvider } from "@/lib/llm/client";

export const assistSuggestionSchema = z
  .object({
    id: z.enum(["s1", "s2", "s3"]),
    title: z.string().trim().min(3).max(80),
    detail: z.string().trim().min(20).max(1200),
    lengthHint: z.enum(["short", "long"]),
  })
  .strict();

export const assistDiagnosisSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    responseType: z.literal("diagnosis"),
    summary: z.string().trim().min(12).max(280),
    suggestions: z.tuple([
      assistSuggestionSchema.extend({
        id: z.literal("s1"),
        lengthHint: z.literal("short"),
      }),
      assistSuggestionSchema.extend({
        id: z.literal("s2"),
        lengthHint: z.literal("short"),
      }),
      assistSuggestionSchema.extend({
        id: z.literal("s3"),
        lengthHint: z.literal("long"),
      }),
    ]),
    providerMeta: z
      .object({
        provider: z.enum(["anthropic", "openai", "gemini"]),
        model: z.string().trim().min(1).max(120),
        mode: z.enum(["manual", "auto", "max"]),
      })
      .strict(),
    validationFallback: z.boolean().optional(),
  })
  .strict();

export type AssistDiagnosis = z.infer<typeof assistDiagnosisSchema>;

function estimateSentenceCount(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function hasValidShortSuggestion(text: string): boolean {
  const count = estimateSentenceCount(text);
  return count >= 1 && count <= 2;
}

function enforceSuggestionShape(value: AssistDiagnosis): AssistDiagnosis {
  const [s1, s2, s3] = value.suggestions;
  if (!hasValidShortSuggestion(s1.detail) || !hasValidShortSuggestion(s2.detail)) {
    throw new Error("First two suggestions must be one to two sentences.");
  }
  if (s3.detail.length < Math.max(s1.detail.length, s2.detail.length) + 30) {
    throw new Error("Third suggestion must be meaningfully longer than short suggestions.");
  }
  return value;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function parseAssistDiagnosisPayload(raw: string): AssistDiagnosis {
  const fromRaw = assistDiagnosisSchema.safeParse(JSON.parse(raw));
  if (fromRaw.success) return enforceSuggestionShape(fromRaw.data);
  const repaired = extractJsonObject(raw);
  if (!repaired) throw new Error("Malformed diagnosis payload.");
  const fromRepair = assistDiagnosisSchema.safeParse(JSON.parse(repaired));
  if (!fromRepair.success) throw new Error("Malformed diagnosis payload.");
  return enforceSuggestionShape(fromRepair.data);
}

export function buildFallbackDiagnosis(input: {
  provider: LlmProvider;
  model: string;
  mode: CreatorModelMode;
  draftHeadline: string;
}): AssistDiagnosis {
  return {
    schemaVersion: "1.0",
    responseType: "diagnosis",
    summary: `Writer momentum stalled near "${input.draftHeadline || "untitled draft"}"; proceed with a concrete next section.`,
    suggestions: [
      {
        id: "s1",
        title: "Clarify the immediate next point",
        detail:
          "Write one sentence that states the exact claim or takeaway for the next paragraph. Keep it concrete and specific.",
        lengthHint: "short",
      },
      {
        id: "s2",
        title: "Bridge from current text",
        detail:
          "Add a transition sentence from the previous paragraph so the reader sees the logical handoff before new evidence.",
        lengthHint: "short",
      },
      {
        id: "s3",
        title: "Build a three-step continuation",
        detail:
          "Draft the next section in three moves: first state the key point, then support it with one example from your draft context, and finish with a sentence that explains why this point matters for the reader’s decision. This creates momentum and keeps your outline coherent without changing your tone.",
        lengthHint: "long",
      },
    ],
    providerMeta: {
      provider: input.provider,
      model: input.model,
      mode: input.mode,
    },
    validationFallback: true,
  };
}
