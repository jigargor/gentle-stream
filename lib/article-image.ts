/**
 * Build URLs for article hero images.
 *
 * Primary: Pollinations — image from the story's imagePrompt (no API key for basic use).
 * Fallback: Picsum — deterministic stock photo per article so something always loads.
 */

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

/** Strip bracket wrappers and clamp length for URL safety */
export function sanitizeImagePrompt(prompt: string): string {
  return prompt
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

export function composeArticleImagePrompt(input: {
  imagePrompt: string;
  category?: string | null;
  location?: string | null;
}): string {
  const base = sanitizeImagePrompt(input.imagePrompt);
  if (!base) return "";
  const category = (input.category ?? "").trim();
  const location = (input.location ?? "").trim();
  const contextParts = [category, location].filter(Boolean);
  const context = contextParts.length > 0 ? `Context: ${contextParts.join(" | ")}.` : "";
  const guardrails =
    "Editorial documentary style, realistic scene, story-specific details, no text overlay, no logos, no watermark.";
  return sanitizeImagePrompt(`${base}. ${context} ${guardrails}`);
}

export function pollinationsImageUrl(
  imagePrompt: string,
  width: number,
  height: number,
  context?: {
    category?: string | null;
    location?: string | null;
  }
): string | null {
  const q = composeArticleImagePrompt({
    imagePrompt,
    category: context?.category ?? null,
    location: context?.location ?? null,
  });
  if (!q) return null;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: "true",
    enhance: "false",
  });
  return `${POLLINATIONS_BASE}/${encodeURIComponent(q)}?${params.toString()}`;
}

/** Stable hash → Picsum seed so the same article always gets the same fallback photo */
export function picsumFallbackUrl(
  seed: string,
  width: number,
  height: number
): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash);
  return `https://picsum.photos/seed/${n}/${width}/${height}`;
}
