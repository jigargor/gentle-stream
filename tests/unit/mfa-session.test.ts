import { describe, expect, it } from "vitest";
import { sessionNeedsMfaStepUp } from "@/lib/auth/mfa-session";

describe("sessionNeedsMfaStepUp", () => {
  it("returns true when aal2 is required but not active", () => {
    expect(
      sessionNeedsMfaStepUp({ currentLevel: "aal1", nextLevel: "aal2" })
    ).toBe(true);
  });

  it("returns false when aal2 is already active", () => {
    expect(
      sessionNeedsMfaStepUp({ currentLevel: "aal2", nextLevel: "aal2" })
    ).toBe(false);
  });

  it("returns false when MFA is not enrolled", () => {
    expect(
      sessionNeedsMfaStepUp({ currentLevel: "aal1", nextLevel: "aal1" })
    ).toBe(false);
  });
});
