/** Wall-clock max session length from successful sign-in (callback); 1-hour hard wall is intentional. */
export const SESSION_MAX_AGE_SEC = 60 * 60;
/** Cookie retention for the login-start timestamp (must outlive policy window). */
const SESSION_START_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** HttpOnly cookie storing Unix seconds when the current login period started. */
export const SESSION_START_COOKIE = "gs_sess_start";

export function parseSessionStart(
  raw: string | undefined
): number | null {
  if (raw === undefined || raw === "") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function sessionStartCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_START_COOKIE_MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  };
}
