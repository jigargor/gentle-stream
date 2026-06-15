export interface AuthenticatorAssuranceLevel {
  currentLevel?: string | null;
  nextLevel?: string | null;
}

export function sessionNeedsMfaStepUp(
  aalData: AuthenticatorAssuranceLevel | null | undefined
): boolean {
  if (!aalData) return false;
  return aalData.nextLevel === "aal2" && aalData.currentLevel !== "aal2";
}
