/**
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be safe in the browser: legacy JWT `anon`, or
 * platform publishable key (`sb_publishable_...`). Never use `service_role` / `sb_secret_`.
 */
export function rejectIfSupabaseKeyIsPlatformSecret(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is set to a Supabase secret API key (sb_secret_...). " +
        "The hosted platform rejects secret keys from browsers with HTTP 401 (e.g. email/password auth). " +
        "In Dashboard → Settings → API, use the publishable key (sb_publishable_...) or legacy anon JWT. " +
        "Keep sb_secret_ / service_role only in server env (e.g. SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
}

/**
 * Supabase JWTs embed `role` in the payload. `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be
 * the anon (public) key. Using the service_role secret there breaks browser auth with
 * "Forbidden use of secret API key in browser" and must never be exposed to clients.
 */
export function rejectIfSupabaseKeyIsServiceRole(key: string): void {
  const payload = decodeJwtPayload(key);
  if (!payload) return;
  if (payload.role === "service_role") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is set to the service_role secret. " +
        "In Supabase → Project Settings → API, copy the anon (public) key into " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY. Keep the service_role key server-only " +
        "(e.g. SUPABASE_SERVICE_ROLE_KEY) — never prefix it with NEXT_PUBLIC_."
    );
  }
}

function decodeJwtPayload(jwt: string): { role?: string } | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad) b64 += "=".repeat(pad);
    let json: string;
    if (typeof atob === "function") {
      json = atob(b64);
    } else if (typeof Buffer !== "undefined") {
      json = Buffer.from(b64, "base64").toString("utf8");
    } else {
      return null;
    }
    return JSON.parse(json) as { role?: string };
  } catch {
    return null;
  }
}
