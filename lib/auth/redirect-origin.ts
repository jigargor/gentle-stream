import { headers } from "next/headers";

/**
 * OAuth / email-verification `redirect_to` origin (scheme + host + optional port).
 *
 * Import this module only from Server Components / Route Handlers — it uses `headers()`.
 *
 * Priority:
 * 1. Request `Host` / `X-Forwarded-Host` when it is localhost or 127.0.0.1 — must match
 *    the address bar so PKCE cookies and `redirect_to` stay on the same origin.
 * 2. `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN` — tunnels, or when Host is missing/wrong.
 * 3. `NODE_ENV === "development"` → `http://localhost:$PORT`
 * 4. `NEXT_PUBLIC_SITE_URL` → deployed canonical URL
 * 5. Infer from host + `X-Forwarded-Proto` / Vercel
 */
export async function getAuthRedirectBaseFromRequest(): Promise<string> {
  const h = await headers();
  const raw =
    (h.get("x-forwarded-host") ?? h.get("host") ?? "").trim() || "";
  const firstHost = raw.split(",")[0].trim();

  const isLocal =
    firstHost.startsWith("127.0.0.1:") ||
    firstHost.startsWith("localhost:") ||
    firstHost === "localhost" ||
    firstHost === "127.0.0.1";

  if (isLocal) {
    if (firstHost.includes(":")) return `http://${firstHost}`;
    return `http://${firstHost}:${process.env.PORT ?? "3000"}`;
  }

  const explicit =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim().replace(/\/$/, "") ?? "";
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "development") {
    return `http://localhost:${process.env.PORT ?? "3000"}`;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
  if (site) return site;

  if (firstHost) {
    const forwardedProto = h.get("x-forwarded-proto");
    const https = forwardedProto === "https" || Boolean(process.env.VERCEL);
    return `${https ? "https" : "http"}://${firstHost}`;
  }

  return "";
}
