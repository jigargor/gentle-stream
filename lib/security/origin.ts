import type { NextRequest } from "next/server";

function trustedOriginsFromRequest(request: NextRequest): Set<string> {
  const set = new Set<string>();
  try {
    set.add(new URL(request.url).origin);
  } catch {
    // ignore malformed request URL
  }
  const envOrigin = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim();
  if (envOrigin) {
    try {
      set.add(new URL(envOrigin).origin);
    } catch {
      // ignore malformed env origin
    }
  }
  return set;
}

export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return true;
  return trustedOriginsFromRequest(request).has(origin);
}
