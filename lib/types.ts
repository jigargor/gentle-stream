import type { Category } from "./constants";

export interface Article {
  headline: string;
  subheadline: string;
  byline: string;
  location: string;
  category: Category;
  body: string;
  pullQuote: string;
  imagePrompt: string;
}

export interface NewsSection {
  articles: Article[];
  index: number;
}

export type LayoutVariant = "hero" | "wide" | "standard";
