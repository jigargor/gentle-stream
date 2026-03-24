/** Keep in sync with server enforcement in `lib/db/users.ts` (updateUserDisplay). */

export const USERNAME_CHANGE_COOLDOWN_HOURS = 24;
export const USERNAME_CHANGE_COOLDOWN_MS =
  USERNAME_CHANGE_COOLDOWN_HOURS * 60 * 60 * 1000;

export function isUsernameChangeLocked(
  username: string | null | undefined,
  usernameSetAt: string | null | undefined
): boolean {
  if (!username?.trim() || !usernameSetAt) return false;
  return (
    Date.now() - new Date(usernameSetAt).getTime() < USERNAME_CHANGE_COOLDOWN_MS
  );
}

export function usernameChangeUnlocksAtIso(usernameSetAt: string): string {
  return new Date(
    new Date(usernameSetAt).getTime() + USERNAME_CHANGE_COOLDOWN_MS
  ).toISOString();
}
