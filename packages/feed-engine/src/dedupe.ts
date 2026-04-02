import type { Article } from "@gentle-stream/domain/types";

function stripCiteTags(text: string): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (lower.startsWith("</cite>", i)) {
      i += "</cite>".length;
      continue;
    }
    if (lower.startsWith("<cite", i)) {
      const close = text.indexOf(">", i + "<cite".length);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out.trim();
}

export function cleanArticleForFeed(article: Article): Article {
  return {
    ...article,
    body: stripCiteTags(article.body ?? ""),
    pullQuote: stripCiteTags(article.pullQuote ?? ""),
    subheadline: stripCiteTags(article.subheadline ?? ""),
    headline: stripCiteTags(article.headline ?? ""),
    sourceUrls: article.sourceUrls ?? [],
  };
}

export function articleUniqKey(article: Article): string {
  if ("id" in article && typeof article.id === "string" && article.id.length > 0) {
    return `id:${article.id}`;
  }
  return `raw:${article.category}|${article.headline}|${article.byline}|${article.location}`;
}
