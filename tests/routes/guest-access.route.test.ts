import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hasTrustedOriginMock = vi.fn();
const verifyTurnstileTokenMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@/lib/security/origin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/origin")>();
  return {
    ...actual,
    hasTrustedOrigin: hasTrustedOriginMock,
  };
});

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

  it("sets guest cookie without signOut when no Supabase session exists", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    const { POST } = await import("@/app/api/auth/guest-access/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ turnstileToken: "token" }),
    });

    const response = await POST(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(setCookie).toContain("gs_guest_access=1");
  });

  it("signs out when a Supabase session cookie is present", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    signOutMock.mockResolvedValueOnce({ error: null });
    const { POST } = await import("@/app/api/auth/guest-access/route");
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie: "sb-example-auth-token=abc",
      },
      body: JSON.stringify({ turnstileToken: "token" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(signOutMock).toHaveBeenCalledWith();
  });

  it("redirects to home for form POST so browsers persist the guest cookie", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    signOutMock.mockResolvedValueOnce({ error: null });
    const { POST } = await import("@/app/api/auth/guest-access/route");
    const body = new URLSearchParams({ turnstileToken: "token" });
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const response = await POST(request);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(setCookie).toContain("gs_guest_access=1");
  });

  it("redirects using Host header when internal URL uses localhost alias", async () => {
    hasTrustedOriginMock.mockReturnValueOnce(true);
    verifyTurnstileTokenMock.mockResolvedValueOnce({ success: true });
    const { POST } = await import("@/app/api/auth/guest-access/route");
    const body = new URLSearchParams({ turnstileToken: "token" });
    const request = new NextRequest("http://localhost:3000/api/auth/guest-access", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3000/");
  });
});
