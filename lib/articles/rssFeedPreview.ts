const RSS_BODY_FOOTER_MARKER =
  "This report is sourced directly from the original RSS item";

const DEFAULT_EXCERPT_CHARS = 420;

interface FeedPreviewArticleShape {
  source?: string;
  contentKind?: string;
  subheadline?: string | null;
  body?: string | null;
}

function stripRssFooter(body: string): string {
  const markerIndex = body.indexOf(RSS_BODY_FOOTER_MARKER);
  if (markerIndex === -1) return body.trim();
  return body.slice(0, markerIndex).trim();
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** One paragraph per block; inner whitespace collapsed to single spaces. */
function splitBodyParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((p) => collapseWhitespace(p))
    .filter(Boolean);
}

function trimToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const limited = text.slice(0, maxChars).trimEnd();
  const sentenceBreak = Math.max(
    limited.lastIndexOf(". "),
    limited.lastIndexOf("! "),
    limited.lastIndexOf("? ")
  );
  if (sentenceBreak >= Math.floor(maxChars * 0.55)) {
    return `${limited.slice(0, sentenceBreak + 1).trimEnd()}…`;
  }
  return `${limited}…`;
}

export function isRssNarrativeArticle(article: FeedPreviewArticleShape): boolean {
  if (article.contentKind === "recipe") return false;
  if (article.source != null && article.source !== "ingest") return false;
  const body = article.body?.trim() ?? "";
  if (!body) return false;
  // All ingest/news bodies use the feed excerpt + reader modal path. The RSS footer
  // marker is optional (older pipelines); without it we previously rendered the full body in-grid.
  return true;
}

export function buildRssFeedExcerpt(
  article: FeedPreviewArticleShape,
  maxChars = DEFAULT_EXCERPT_CHARS
): string {
  const stripped = stripRssFooter(article.body ?? "");
  const paragraphs = splitBodyParagraphs(stripped);
  const max = Math.max(120, maxChars);

  if (paragraphs.length === 0) {
    const subheadline = collapseWhitespace(article.subheadline ?? "");
    if (!subheadline) return "";
    return trimToSentence(subheadline, max);
  }

  if (paragraphs.length === 1) {
    return trimToSentence(paragraphs[0], max);
  }

  const chunks: string[] = [];
  let used = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const joiner = chunks.length ? 2 : 0;
    if (used + joiner + para.length <= max) {
      chunks.push(para);
      used += joiner + para.length;
      continue;
    }
    const room = max - used - joiner;
    if (room >= 40) {
      chunks.push(trimToSentence(para, room));
    }
    break;
  }

  if (chunks.length === 0) {
    return trimToSentence(paragraphs[0], max);
  }
  return chunks.join("\n\n");
}

function comparableExcerpt(text: string): string {
  return collapseWhitespace(text).replace(/…+$/u, "").trim();
}

export function rssHasExtraContentBeyondExcerpt(
  article: FeedPreviewArticleShape,
  maxChars = DEFAULT_EXCERPT_CHARS
): boolean {
  const full = collapseWhitespace(stripRssFooter(article.body ?? ""));
  if (!full) return false;

  const excerpt = buildRssFeedExcerpt(article, maxChars);
  if (!excerpt) return false;

  const excerptComparable = comparableExcerpt(excerpt);
  if (!excerptComparable) return false;
  if (full.length <= excerptComparable.length + 24) return false;

  const fullLower = full.toLowerCase();
  const excerptLower = excerptComparable.toLowerCase();
  if (fullLower.startsWith(excerptLower) && full.length - excerptComparable.length < 40) {
    return false;
  }

  return true;
}
