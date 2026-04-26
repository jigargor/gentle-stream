import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hasTrustedOriginMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const verifyTurnstileTokenMock = vi.fn();
const createPublicServerClientMock = vi.fn();
const createSupabaseResponseClientMock = vi.fn();
const getOrCreateUserProfileMock = vi.fn();

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

vi.mock("@/lib/supabase/response-client", () => ({
  createSupabaseResponseClient: createSupabaseResponseClientMock,
}));

vi.mock("@/lib/db/users", () => ({
  getOrCreateUserProfile: getOrCreateUserProfileMock,
}));

describe("/api/auth/email-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for untrusted origin", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(false);
    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid email payload", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({
        email: "bad",
        password: "password123",
        mode: "sign_in",
        redirectTo: "http://localhost/login",
        turnstileToken: "x",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid sign-up request", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    createPublicServerClientMock.mockReturnValueOnce({
      auth: {
        signUp: vi.fn().mockResolvedValue({ error: null }),
      },
    });
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN = "http://localhost:3000";

    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        password: "password123",
        mode: "sign_up",
        birthDate: "1990-01-01",
        redirectTo: "http://localhost:3000/login",
        turnstileToken: "token",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      requiresEmailVerification: false,
      verificationEmailSent: true,
    });
  });

  it("returns 400 when birthdate results in negative age", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN = "http://localhost:3000";

    const futureBirthDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        password: "password123",
        mode: "sign_up",
        birthDate: futureBirthDate,
        redirectTo: "http://localhost:3000/login",
        turnstileToken: "token",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Birthdate cannot result in a negative age.",
    });
  });

  it("returns 200 for valid sign-in request", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    createSupabaseResponseClientMock.mockReturnValueOnce({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "u1", email_confirmed_at: "2026-01-01T00:00:00.000Z" },
          },
          error: null,
        }),
      },
    });
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN = "http://localhost:3000";

    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        password: "password123",
        mode: "sign_in",
        redirectTo: "http://localhost:3000/login",
        turnstileToken: "token",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      requiresEmailVerification: false,
    });
  });

  it("returns 400 when Turnstile validation fails", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock.mockReturnValue({ allowed: true });
    verifyTurnstileTokenMock.mockResolvedValueOnce({
      success: false,
      error: "Captcha verification failed.",
    });

    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        password: "password123",
        mode: "sign_in",
        redirectTo: "http://localhost:3000/login",
        turnstileToken: "bad-token",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Captcha verification failed.",
    });
  });

  it("returns 429 when email rate limit is exceeded after IP pass", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    consumeRateLimitMock
      .mockReturnValueOnce({ allowed: true })
      .mockReturnValueOnce({ allowed: false, retryAfterSec: 60 });

    const { POST } = await import("@/app/api/auth/email-password/route");
    const req = new NextRequest("http://localhost:3000/api/auth/email-password", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        password: "password123",
        mode: "sign_in",
        redirectTo: "http://localhost:3000/login",
        turnstileToken: "token",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(verifyTurnstileTokenMock).not.toHaveBeenCalled();
  });
});
