import type { NextRequest } from "next/server";

if (!process.env.CRON_SECRET) {
  console.warn(
    "[cron] CRON_SECRET is not configured — all cron requests will be denied."
  );
}

function isCronIpAllowed(request: NextRequest): boolean {
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "";
  return ip.startsWith("76.76.21.");
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Manual / legacy calls may use `x-cron-secret`.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) {
    if (process.env.NODE_ENV === "production" && !isCronIpAllowed(request)) {
      console.warn(
        "[cron] Secret matched but IP not in Vercel range:",
        request.headers.get("x-real-ip")
      );
    }
    return true;
  }

  if (request.headers.get("x-cron-secret") === expected) return true;

  return false;
}
