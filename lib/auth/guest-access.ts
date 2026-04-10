export const GUEST_ACCESS_COOKIE = "gs_guest_access";
const GUEST_ACCESS_COOKIE_VALUE = "1";
const GUEST_ACCESS_MAX_AGE_SEC = 60 * 60 * 8;

export function guestAccessCookieOptions() {
  return {
    path: "/",
    maxAge: GUEST_ACCESS_MAX_AGE_SEC,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

export function hasGuestAccessCookie(value: string | null | undefined): boolean {
  return value === GUEST_ACCESS_COOKIE_VALUE;
}

