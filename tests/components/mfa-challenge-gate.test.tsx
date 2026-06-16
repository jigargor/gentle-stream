import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MfaChallengeGate } from "@/components/auth/mfa/MfaChallengeGate";

const createClientMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => createClientMock(),
}));

describe("MfaChallengeGate", () => {
  it("calls onPassed immediately when skip is true without MFA UI", async () => {
    const onPassed = vi.fn();
    createClientMock.mockReset();

    render(<MfaChallengeGate onPassed={onPassed} skip />);

    await waitFor(() => {
      expect(onPassed).toHaveBeenCalledTimes(1);
    });
  });
});
