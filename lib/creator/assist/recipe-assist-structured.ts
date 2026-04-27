import type { CreatorWorkflowId } from "@/lib/creator/workflows";
import { generateCreatorText } from "@/lib/creator/model-router";
import type { LlmProvider } from "@/lib/llm/client";
import { buildRecipeBaseContext } from "@/lib/creator/assist/recipe-base-context";
import {
  buildFallbackRecipeAssist,
  buildRecipeJsonShapeInstruction,
  formatRecipeAssistDisplayText,
  parseRecipeAssistPayload,
  type RecipeAssistStructured,
} from "@/lib/creator/assist/recipe-structured-output";
import { getRecipeSkillTemplate, type RecipeAssistIntent } from "@/lib/creator/assist/recipe-skill";

export interface RecipeAssistStructuredGeneration {
  structured: RecipeAssistStructured;
  displayText: string;
  provider: LlmProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function buildRecipePrompt(input: {
  workflowId: CreatorWorkflowId;
  intent: RecipeAssistIntent;
  helpMode?: "inspiration" | "brainstorm" | "random" | "stuck";
  headline: string;
  body: string;
  context?: string;
  memorySummary: string;
  recipeServings?: number | null;
  recipePrepTimeMinutes?: number | null;
  recipeCookTimeMinutes?: number | null;
  recipeIngredients: string[];
  recipeInstructions: string[];
}): string {
  const skill = getRecipeSkillTemplate(input.intent);
  const baseContext = buildRecipeBaseContext({
    intent: input.intent,
    workflowId: input.workflowId,
    helpMode: input.helpMode,
    headline: input.headline,
    body: input.body,
    memorySummary: input.memorySummary,
    recipeServings: input.recipeServings,
    recipePrepTimeMinutes: input.recipePrepTimeMinutes,
    recipeCookTimeMinutes: input.recipeCookTimeMinutes,
    recipeIngredients: input.recipeIngredients,
    recipeInstructions: input.recipeInstructions,
    context: input.context,
  });
  const task =
    input.intent === "headline"
      ? "Task: propose a strong recipe title and tight supporting ingredients/steps updates."
      : input.intent === "startup"
        ? "Task: provide a beginner-friendly recipe starting point because draft context is sparse."
        : input.intent === "stuck"
          ? "Task: diagnose what blocks progress and provide concrete ingredient + instruction next moves."
          : "Task: improve the current recipe draft while preserving the intended dish.";

  return [
    baseContext,
    `Skill purpose: ${skill.purpose}`,
    `Skill directive: ${skill.systemInstruction}`,
    task,
    buildRecipeJsonShapeInstruction(),
  ].join("\n\n");
}

export async function generateRecipeAssistStructured(input: {
  userId: string;
  workflowId: CreatorWorkflowId;
  route: string;
  callKind: string;
  intent: RecipeAssistIntent;
  helpMode?: "inspiration" | "brainstorm" | "random" | "stuck";
  headline: string;
  body: string;
  context?: string;
  memorySummary: string;
  recipeServings?: number | null;
  recipePrepTimeMinutes?: number | null;
  recipeCookTimeMinutes?: number | null;
  recipeIngredients: string[];
  recipeInstructions: string[];
}): Promise<RecipeAssistStructuredGeneration> {
  const prompt = buildRecipePrompt(input);
  const completion = await generateCreatorText({
    userId: input.userId,
    workflowId: input.workflowId,
    callKind: input.callKind,
    route: input.route,
    prompt,
    maxTokens: 750,
    temperature: 0.4,
  });
  let structured: RecipeAssistStructured;
  try {
    structured = parseRecipeAssistPayload(completion.text.trim());
  } catch {
    structured = buildFallbackRecipeAssist({
      headline: input.headline,
      recipeIngredients: input.recipeIngredients,
      recipeInstructions: input.recipeInstructions,
    });
  }
  return {
    structured,
    displayText: formatRecipeAssistDisplayText(structured),
    provider: completion.provider,
    model: completion.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}
