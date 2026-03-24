import type { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Manual / legacy calls may use `x-cron-secret`.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;

  if (request.headers.get("x-cron-secret") === expected) return true;

  return false;
}
