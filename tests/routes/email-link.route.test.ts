import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hasTrustedOriginMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const verifyTurnstileTokenMock = vi.fn();
const createPublicServerClientMock = vi.fn();

vi.mock("@/lib/security/origin", () => ({
  hasTrustedOrigin: hasTrustedOriginMock,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  buildRateLimitKey: vi.fn(() => "k"),
  consumeRateLimit: consumeRateLimitMock,
  getClientIp: vi.fn(() => "127.0.0.1"),
  rateLimitExceededResponse: vi.fn(() => new Response(null, { status: 429 })),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: verifyTurnstileTokenMock,
}));

vi.mock("@/lib/supabase/public-server", () => ({
  createPublicServerClient: createPublicServerClientMock,
}));

describe("/api/auth/email-link", () => {
  it("returns 403 for untrusted origin", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(false);
    const { POST } = await import("@/app/api/auth/email-link/route");
    const req = new NextRequest("http://localhost/api/auth/email-link", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid email payload", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    const { POST } = await import("@/app/api/auth/email-link/route");
    const req = new NextRequest("http://localhost/api/auth/email-link", {
      method: "POST",
      body: JSON.stringify({
        email: "bad",
        redirectTo: "http://localhost/login",
        turnstileToken: "x",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid request", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    createPublicServerClientMock.mockReturnValueOnce({
      auth: {
        signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      },
    });
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN = "http://localhost:3000";

    const { POST } = await import("@/app/api/auth/email-link/route");
    const req = new NextRequest("http://localhost:3000/api/auth/email-link", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        redirectTo: "http://localhost:3000/login",
        turnstileToken: "token",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
