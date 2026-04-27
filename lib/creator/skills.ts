import type { BuiltInArticleType } from "@/lib/creator/article-types";

export interface CreatorSkillTemplate {
  id: string;
  version: number;
  articleType: BuiltInArticleType | "custom";
  purpose: string;
  systemInstruction: string;
}

const SKILL_VERSION = 1;

export const CREATOR_SKILL_TEMPLATES: CreatorSkillTemplate[] = [
  {
    id: "skill-explanatory-v1",
    version: SKILL_VERSION,
    articleType: "explanatory",
    purpose: "Explain complex topics clearly.",
    systemInstruction: "Write with clarity-first pedagogy, concrete examples, and progressive disclosure.",
  },
  {
    id: "skill-investigative-v1",
    version: SKILL_VERSION,
    articleType: "investigative",
    purpose: "Structure evidence-heavy investigative writing.",
    systemInstruction: "Prioritize claims-evidence separation and explicitly label uncertainty.",
  },
  {
    id: "skill-podcast-script-v1",
    version: SKILL_VERSION,
    articleType: "podcast_script",
    purpose: "Generate spoken-word script pacing.",
    systemInstruction: "Optimize for spoken cadence with natural transitions and segment markers.",
  },
  {
    id: "skill-personal-essay-v1",
    version: SKILL_VERSION,
    articleType: "personal_essay",
    purpose: "Support reflective first-person narrative.",
    systemInstruction: "Keep voice authentic and specific while avoiding unsupported factual claims.",
  },
  {
    id: "skill-custom-v1",
    version: SKILL_VERSION,
    articleType: "custom",
    purpose: "Fallback for user-defined article type.",
    systemInstruction: "Adapt structure and tone to the requested format while preserving clarity.",
  },
];

export function getSkillTemplateByArticleType(articleType: string): CreatorSkillTemplate {
  return (
    CREATOR_SKILL_TEMPLATES.find((skill) => skill.articleType === articleType) ??
    CREATOR_SKILL_TEMPLATES.find((skill) => skill.articleType === "custom")!
  );
}
