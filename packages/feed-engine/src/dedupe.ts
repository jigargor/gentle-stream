import type { Article } from "@gentle-stream/domain/types";

import { stripInlineHtmlToPlainText } from "./stripInlineHtml";

export function cleanArticleForFeed(article: Article): Article {
  return {
    ...article,
    body: stripInlineHtmlToPlainText(article.body ?? ""),
    pullQuote: stripInlineHtmlToPlainText(article.pullQuote ?? ""),
    subheadline: stripInlineHtmlToPlainText(article.subheadline ?? ""),
    headline: stripInlineHtmlToPlainText(article.headline ?? ""),
    sourceUrls: article.sourceUrls ?? [],
  };
}

export function articleUniqKey(article: Article): string {
  if ("id" in article && typeof article.id === "string" && article.id.length > 0) {
    return `id:${article.id}`;
  }
  return `raw:${article.category}|${article.headline}|${article.byline}|${article.location}`;
}
