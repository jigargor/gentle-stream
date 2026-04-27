export type RecipeAssistIntent = "startup" | "improve" | "continue" | "headline" | "stuck";

export interface RecipeSkillTemplate {
  id: string;
  version: number;
  purpose: string;
  systemInstruction: string;
}

const RECIPE_SKILL_VERSION = 1;

const RECIPE_SKILLS: Record<RecipeAssistIntent, RecipeSkillTemplate> = {
  startup: {
    id: "recipe-skill-startup-v1",
    version: RECIPE_SKILL_VERSION,
    purpose: "Help a creator start a recipe from sparse context.",
    systemInstruction:
      "Propose approachable recipe skeletons with realistic pantry-first ingredients and concise numbered steps.",
  },
  improve: {
    id: "recipe-skill-improve-v1",
    version: RECIPE_SKILL_VERSION,
    purpose: "Improve recipe clarity and cookability.",
    systemInstruction:
      "Prioritize concrete ingredient amounts, ordered prep flow, and realistic sequencing for home cooks.",
  },
  continue: {
    id: "recipe-skill-continue-v1",
    version: RECIPE_SKILL_VERSION,
    purpose: "Continue unfinished recipes with coherent next steps.",
    systemInstruction:
      "Add only the next logical ingredients and instructions while preserving the existing dish direction.",
  },
  headline: {
    id: "recipe-skill-headline-v1",
    version: RECIPE_SKILL_VERSION,
    purpose: "Create clear, appetizing recipe titles.",
    systemInstruction:
      "Generate specific, search-friendly recipe titles that mention the main dish style and key ingredient.",
  },
  stuck: {
    id: "recipe-skill-stuck-v1",
    version: RECIPE_SKILL_VERSION,
    purpose: "Unblock recipe authors who are uncertain about next moves.",
    systemInstruction:
      "Diagnose the most likely cooking-logic gap and suggest one practical next action for ingredients or steps.",
  },
};

export function getRecipeSkillTemplate(intent: RecipeAssistIntent): RecipeSkillTemplate {
  return RECIPE_SKILLS[intent];
}
