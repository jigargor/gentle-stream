/**
 * Strip HTML tags to plain text for ingest, RSS normalization, and dedupe.
 * Uses repeated passes so CodeQL does not flag incomplete sanitization, and
 * script/style blocks: closing tags must match `</script ...>` / `</style ...>`
 * where `...` may include whitespace or bogus tokens before `>` (HTML/XSS edge cases).
 */
export function stripInlineHtmlToPlainText(value: string): string {
  if (!value) return "";
  let out = value.replace(/<br\s*\/?>/gi, "\n");
  let prev = "";
  let guard = 0;
  while (out !== prev && guard < 50) {
    prev = out;
    out = out
      .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    guard += 1;
  }
  return out
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
