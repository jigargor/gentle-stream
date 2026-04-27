import { z } from "zod";

export const recipeAssistStructuredSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    responseType: z.literal("recipe_assist"),
    summary: z.string().trim().min(12).max(1200),
    suggestedHeadline: z.string().trim().min(3).max(180).nullable().optional(),
    suggestedIngredients: z.array(z.string().trim().min(2).max(180)).max(20),
    suggestedInstructions: z.array(z.string().trim().min(6).max(420)).max(16),
    starterOption: z.string().trim().min(6).max(360).nullable().optional(),
    nextAction: z.string().trim().min(6).max(220),
  })
  .strict();

export type RecipeAssistStructured = z.infer<typeof recipeAssistStructuredSchema>;

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function buildRecipeJsonShapeInstruction(): string {
  return [
    "Return only valid JSON (no markdown fences) with this exact shape:",
    "{",
    '  "schemaVersion": "1.0",',
    '  "responseType": "recipe_assist",',
    '  "summary": "Brief strategy summary.",',
    '  "suggestedHeadline": "Optional improved recipe title or null",',
    '  "suggestedIngredients": ["ingredient 1", "ingredient 2"],',
    '  "suggestedInstructions": ["step 1", "step 2"],',
    '  "starterOption": "Optional first sentence to get unstuck when blank, or null",',
    '  "nextAction": "Single concrete next move for the writer"',
    "}",
    "Rules:",
    "- suggestedIngredients should be practical for home cooks and avoid invented specialty items unless clearly justified.",
    "- suggestedInstructions should be short imperative steps in logical order.",
    "- If user already provided ingredients or instructions, improve/extend them instead of replacing with unrelated dishes.",
  ].join("\n");
}

export function parseRecipeAssistPayload(raw: string): RecipeAssistStructured {
  try {
    const fromRaw = recipeAssistStructuredSchema.safeParse(JSON.parse(raw));
    if (fromRaw.success) return fromRaw.data;
  } catch {
    // fall through to repaired extraction
  }
  const repaired = extractJsonObject(raw);
  if (!repaired) throw new Error("Malformed recipe assist payload.");
  const fromRepair = recipeAssistStructuredSchema.safeParse(JSON.parse(repaired));
  if (!fromRepair.success) throw new Error("Malformed recipe assist payload.");
  return fromRepair.data;
}

export function buildFallbackRecipeAssist(input: {
  headline: string;
  recipeIngredients: string[];
  recipeInstructions: string[];
}): RecipeAssistStructured {
  const dish = input.headline.trim() || "simple weeknight dinner";
  const hasIngredients = input.recipeIngredients.length > 0;
  const hasInstructions = input.recipeInstructions.length > 0;
  return {
    schemaVersion: "1.0",
    responseType: "recipe_assist",
    summary: `Focus "${dish}" on a clear base, an aromatic layer, and one finishing note so the recipe is easy to execute.`,
    suggestedHeadline: input.headline.trim() || `Easy ${dish}`,
    suggestedIngredients: hasIngredients
      ? input.recipeIngredients.slice(0, 8)
      : ["2 tbsp olive oil", "1 onion, diced", "2 cloves garlic", "salt and black pepper"],
    suggestedInstructions: hasInstructions
      ? input.recipeInstructions.slice(0, 8)
      : [
          "Heat the oil in a skillet over medium heat and cook the onion until translucent.",
          "Stir in garlic and cook for 30 seconds until fragrant.",
          "Add your main ingredient, season lightly, and cook until tender and evenly browned.",
          "Taste, adjust seasoning, and serve warm.",
        ],
    starterOption: `Start with one sentence naming the core dish and flavor direction for ${dish}.`,
    nextAction: "Write the first 4 ingredients with rough amounts, then draft 3 numbered steps.",
  };
}

export function formatRecipeAssistDisplayText(payload: RecipeAssistStructured): string {
  const lines: string[] = [payload.summary];
  if (payload.starterOption) {
    lines.push("", `Starter option: ${payload.starterOption}`);
  }
  if (payload.suggestedIngredients.length > 0) {
    lines.push(
      "",
      "Suggested ingredients:",
      ...payload.suggestedIngredients.map((entry) => `- ${entry}`)
    );
  }
  if (payload.suggestedInstructions.length > 0) {
    lines.push(
      "",
      "Suggested instructions:",
      ...payload.suggestedInstructions.map((entry, index) => `${index + 1}. ${entry}`)
    );
  }
  lines.push("", `Next action: ${payload.nextAction}`);
  return lines.join("\n");
}
