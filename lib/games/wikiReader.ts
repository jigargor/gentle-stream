/**
 * Helpers for in-app English Wikipedia reading (Rabbit Hole).
 * Article HTML is fetched server-side; only en.wikipedia.org / en.m.wikipedia.org article URLs are accepted.
 */

const WIKI_HOSTS = new Set(["en.wikipedia.org", "en.m.wikipedia.org"]);

export function parseEnglishWikipediaArticleTitle(href: string): string | null {
  try {
    const u = new URL(href, "https://en.wikipedia.org");
    if (!WIKI_HOSTS.has(u.hostname.toLowerCase())) return null;
    const path = u.pathname.replace(/\/+$/, "");
    if (!path.startsWith("/wiki/")) return null;
    const raw = path.slice("/wiki/".length);
    if (!raw || raw.includes(":")) return null;
    const decoded = decodeURIComponent(raw.replace(/_/g, " "));
    return decoded.trim() || null;
  } catch {
    return null;
  }
}

/** Strip common active-content patterns from upstream HTML (defense in depth). */
export function stripUnsafeWikiHtmlFragment(html: string): string {
  let out = html;
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  out = out.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  out = out.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  return out;
}

export function wikiHtmlApiPathForTitle(title: string): string {
  return `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.trim())}`;
}
