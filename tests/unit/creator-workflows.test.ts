import { describe, expect, it } from "vitest";
import { BUILT_IN_ARTICLE_TYPES } from "@/lib/creator/article-types";
import { CREATOR_SKILL_TEMPLATES } from "@/lib/creator/skills";
import { CREATOR_WORKFLOWS, creatorWorkflowSchema } from "@/lib/creator/workflows";

describe("creator workflow fixtures", () => {
  it("validates all workflow definitions", () => {
    for (const workflow of CREATOR_WORKFLOWS) {
      expect(() => creatorWorkflowSchema.parse(workflow)).not.toThrow();
    }
  });

  it("has skill coverage for built-in article types with custom fallback", () => {
    const articleTypeSet = new Set(BUILT_IN_ARTICLE_TYPES);
    const skillTypes = new Set(CREATOR_SKILL_TEMPLATES.map((skill) => skill.articleType));
    expect(skillTypes.has("custom")).toBe(true);
    const hasAtLeastOneBuiltIn = Array.from(articleTypeSet).some((type) => skillTypes.has(type));
    expect(hasAtLeastOneBuiltIn).toBe(true);
  });
});
