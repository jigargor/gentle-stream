/** Build CSP `img-src` allowlist — replaces broad `https:` wildcard (#59 XSS blast radius). */
export function buildCspImgSrcDirective(supabaseOrigin: string): string {
  const origins = [
    "'self'",
    "data:",
    "blob:",
    "https://image.pollinations.ai",
    "https://picsum.photos",
    "https://apod.nasa.gov",
    "https://www.nasa.gov",
    "https://i.scdn.co",
    "https://mosaic.scdn.co",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://lh3.googleusercontent.com",
  ];

  if (supabaseOrigin) {
    origins.push(supabaseOrigin);
    try {
      const host = new URL(supabaseOrigin).host;
      if (host.endsWith(".supabase.co")) {
        origins.push(`https://*.${host.split(".").slice(-2).join(".")}`);
      }
    } catch {
      // ignore malformed supabase URL
    }
  }

  return `img-src ${origins.join(" ")}`;
}
