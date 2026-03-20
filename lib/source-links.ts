/**
 * `sourceUrls` in the DB are normalised (host + path, no scheme) — see `normaliseUrl`.
 * These helpers turn them into safe outbound links.
 */

export function toClickableSourceUrl(normalised: string): string {
  const t = normalised.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Short label for a link (e.g. bbc.com) */
export function sourceLinkLabel(normalised: string): string {
  const href = toClickableSourceUrl(normalised);
  if (!href) return "";
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return normalised.length > 48 ? `${normalised.slice(0, 45)}…` : normalised;
  }
}

/** Dedupe while preserving order */
export function uniqueSourceUrls(urls: string[] | undefined): string[] {
  if (!urls?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const k = u.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
