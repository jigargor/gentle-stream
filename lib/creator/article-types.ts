export const BUILT_IN_ARTICLE_TYPES = [
  "explanatory",
  "how_to",
  "opinion",
  "analysis",
  "feature",
  "interview",
  "profile",
  "review",
  "investigative",
  "data_journalism",
  "longform",
  "explainer_video_script",
  "podcast_script",
  "photo_essay",
  "documentary_treatment",
  "serialized_fiction",
  "newsletter_issue",
  "case_study",
  "white_paper",
  "report_brief",
  "faq",
  "timeline",
  "annotated_bibliography",
  "comparative_piece",
  "editorial",
  "satire",
  "personal_essay",
] as const;

export type BuiltInArticleType = (typeof BUILT_IN_ARTICLE_TYPES)[number];

export function isBuiltInArticleType(value: string): value is BuiltInArticleType {
  return (BUILT_IN_ARTICLE_TYPES as readonly string[]).includes(value);
}

export function articleTypeLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
