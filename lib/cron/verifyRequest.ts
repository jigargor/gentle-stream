import type { NextRequest } from "next/server";

if (!process.env.CRON_SECRET) {
  console.warn(
    "[cron] CRON_SECRET is not configured — all cron requests will be denied."
  );
}

const CRON_IP_WARNING_WINDOW_MS = 60 * 60 * 1000;
const cronIpWarningState = new Map<string, number>();

function getCronRequestIp(request: NextRequest): string {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    ""
  );
}

function isCronIpAllowed(request: NextRequest): boolean {
  const ip = getCronRequestIp(request);
  return ip.startsWith("76.76.21.");
}

function warnIfUnexpectedCronIp(request: NextRequest): void {
  if (isCronIpAllowed(request)) return;
  const ip = getCronRequestIp(request) || "unknown";
  const nowMs = Date.now();
  const lastWarnAt = cronIpWarningState.get(ip) ?? 0;
  if (nowMs - lastWarnAt < CRON_IP_WARNING_WINDOW_MS) return;
  cronIpWarningState.set(ip, nowMs);
  console.warn("[cron] Secret matched but IP not in Vercel range:", {
    ip,
    xVercelForwardedFor: request.headers.get("x-vercel-forwarded-for"),
    xRealIp: request.headers.get("x-real-ip"),
  });
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) return false;
  if (process.env.NODE_ENV !== "production") return true;
  if (isCronIpAllowed(request)) return true;
  warnIfUnexpectedCronIp(request);

  return false;
}
