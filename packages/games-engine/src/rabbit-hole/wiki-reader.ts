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

/** Strict hostname allowlist for in-app reader navigation. */
export function isAllowedEnglishWikipediaHost(hostname: string): boolean {
  return WIKI_HOSTS.has(hostname.trim().toLowerCase());
}

/** Strip all HTML tags so no active content can execute. */
export function stripUnsafeWikiHtmlFragment(html: string): string {
  if (!html) return "";
  let out = "";
  let insideTag = false;
  for (const char of html) {
    if (char === "<") {
      insideTag = true;
      out += " ";
      continue;
    }
    if (char === ">") {
      insideTag = false;
      out += " ";
      continue;
    }
    if (!insideTag) out += char;
  }
  return out.split(/\s+/).filter(Boolean).join(" ");
}

export function wikiHtmlApiPathForTitle(title: string): string {
  return `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.trim())}`;
}
