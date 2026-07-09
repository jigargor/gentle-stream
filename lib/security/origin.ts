import type { NextRequest } from "next/server";

function addLoopbackAliases(set: Set<string>, host: string, scheme: "http" | "https"): void {
  const [hostname, port] = host.split(":");
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") {
    return;
  }
  const portSuffix = port ? `:${port}` : "";
  set.add(`${scheme}://127.0.0.1${portSuffix}`);
  set.add(`${scheme}://localhost${portSuffix}`);
  set.add(`${scheme}://[::1]${portSuffix}`);
}

function trustedOriginsFromRequest(request: NextRequest): Set<string> {
  const set = new Set<string>();
  try {
    set.add(new URL(request.url).origin);
  } catch {
    // ignore malformed request URL
  }

  const hostHeader =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.trim();
  if (hostHeader) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const scheme = forwardedProto === "https" ? "https" : "http";
    set.add(`${scheme}://${hostHeader}`);
    addLoopbackAliases(set, hostHeader, scheme);
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

/** Origin the client used (Host / forwarded headers), not Next.js internal request.url. */
export function getRequestOrigin(request: NextRequest): string {
  const hostHeader =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.trim();
  if (hostHeader) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const scheme = forwardedProto === "https" ? "https" : "http";
    return `${scheme}://${hostHeader}`;
  }
  return new URL(request.url).origin;
}
