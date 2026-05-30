import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hasTrustedOriginMock = vi.fn();
const verifyTurnstileTokenMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  hasTrustedOrigin: hasTrustedOriginMock,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
}));

vi.mock("@/lib/supabase/response-client", () => ({
  createSupabaseResponseClient: vi.fn(() => ({
    auth: {
      signOut: signOutMock,
    },
  })),
}));

describe("/api/auth/guest-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for untrusted origin", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(false);
    const { POST } = await import("@/app/api/auth/guest-access/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      body: JSON.stringify({ turnstileToken: "token" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("sets guest cookie and clears local auth session on success", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    signOutMock.mockResolvedValueOnce({ error: null });
    const { POST } = await import("@/app/api/auth/guest-access/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      body: JSON.stringify({ turnstileToken: "token" }),
    });

    const response = await POST(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(setCookie).toContain("gs_guest_access=1");
    expect(setCookie).toContain("gs_sess_start=");
  });
});
