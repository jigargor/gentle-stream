import { describe, expect, it } from "vitest";
import {
  buildFallbackRecipeAssist,
  formatRecipeAssistDisplayText,
  parseRecipeAssistPayload,
} from "@/lib/creator/assist/recipe-structured-output";

describe("recipe assist structured output", () => {
  it("parses a valid structured payload", () => {
    const payload = {
      schemaVersion: "1.0",
      responseType: "recipe_assist",
      summary: "Use a high-heat sear first, then add aromatics and a short simmer.",
      suggestedHeadline: "Weeknight Garlic Tomato Chicken",
      suggestedIngredients: ["2 chicken breasts", "2 cloves garlic", "1 cup crushed tomatoes"],
      suggestedInstructions: [
        "Season chicken and sear in oil until browned on both sides.",
        "Add garlic and cook for 30 seconds.",
        "Stir in tomatoes and simmer until chicken is cooked through.",
      ],
      starterOption: "Start by listing your protein and sauce base in one sentence.",
      nextAction: "Write exact amounts for each ingredient before refining instructions.",
    };

    expect(parseRecipeAssistPayload(JSON.stringify(payload))).toMatchObject({
      responseType: "recipe_assist",
      suggestedIngredients: expect.arrayContaining(["2 chicken breasts"]),
    });
  });

  it("repairs payload wrapped with extra non-json text", () => {
    const raw = `Here is your result:\n${JSON.stringify({
      schemaVersion: "1.0",
      responseType: "recipe_assist",
      summary: "Keep the sauce light and finish with fresh acid.",
      suggestedHeadline: "Lemon Herb Pasta",
      suggestedIngredients: ["200g pasta", "1 lemon", "olive oil"],
      suggestedInstructions: [
        "Boil pasta until al dente.",
        "Toss with olive oil, lemon juice, and zest.",
      ],
      starterOption: null,
      nextAction: "Taste and adjust salt before serving.",
    })}\nThanks!`;

    const parsed = parseRecipeAssistPayload(raw);
    expect(parsed.suggestedHeadline).toBe("Lemon Herb Pasta");
    expect(parsed.suggestedInstructions).toHaveLength(2);
  });

  it("formats fallback display text with starter and next action", () => {
    const fallback = buildFallbackRecipeAssist({
      headline: "Cozy Lentil Soup",
      recipeIngredients: [],
      recipeInstructions: [],
    });
    const display = formatRecipeAssistDisplayText(fallback);
    expect(display).toContain("Suggested ingredients:");
    expect(display).toContain("Next action:");
  });
});
