import type { CreatorModelMode } from "@/lib/db/creatorStudio";
import type { AssistDiagnosis } from "@/lib/creator/assist-structured-output";
import { assistOutputAdapters } from "@/lib/creator/assist-output-adapters";
import { generateCreatorText } from "@/lib/creator/model-router";
import type { LlmProvider } from "@/lib/llm/client";

interface GenerateAssistDiagnosisInput {
  userId: string;
  workflowId: string;
  route: string;
  callKind: string;
  headline: string;
  body: string;
  context?: string;
  selectedText?: string;
  modeOverride?: CreatorModelMode;
}

export interface AssistDiagnosisGeneration {
  diagnosis: AssistDiagnosis;
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateAssistDiagnosis(
  input: GenerateAssistDiagnosisInput
): Promise<AssistDiagnosisGeneration> {
  const preferredAdapter = assistOutputAdapters.openai;
  const prompt = preferredAdapter.buildPrompt({
    mode: input.modeOverride ?? "auto",
    headline: input.headline,
    body: input.body,
    selectedText: input.selectedText,
    context: input.context,
  });
  const completion = await generateCreatorText({
    userId: input.userId,
    workflowId: input.workflowId,
    callKind: input.callKind,
    route: input.route,
    prompt,
    maxTokens: 600,
    temperature: 0.2,
    modelModeOverride: input.modeOverride,
  });
  const adapter = assistOutputAdapters[completion.provider];
  const diagnosis = adapter.parseOutput(completion, input.modeOverride ?? "auto", input.headline);
  return {
    diagnosis: {
      ...diagnosis,
      providerMeta: {
        ...diagnosis.providerMeta,
        provider: completion.provider,
        model: completion.model,
        mode: diagnosis.providerMeta.mode,
      },
    },
    provider: completion.provider,
    model: completion.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}
