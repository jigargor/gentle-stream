/**
 * Base URL for Supabase OAuth / magic-link `redirect_to` (before `/auth/callback`).
 *
 * In development we ignore `NEXT_PUBLIC_SITE_URL` so a production URL in `.env.local`
 * does not send you to Vercel after Google sign-in. Set `NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN`
 * if you use a port other than 3000.
 */
export function getAuthRedirectOriginServer(): string {
  const explicit =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim().replace(/\/$/, "") ?? "";
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
  if (site) return site;

  return "";
}
