import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GUEST_ACCESS_COOKIE } from "@/lib/auth/guest-access";

const getUserMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

vi.mock("@/lib/supabase/response-client", () => ({
  createSupabaseResponseClient: vi.fn(() => ({
    auth: {
      signOut: signOutMock,
    },
  })),
}));

describe("updateSession middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through when auth disabled in non-production", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    mutableEnv.AUTH_DISABLED = "1";
    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/");
    const res = await updateSession(req);
    expect(res.status).toBe(200);
  });

  it("throws in production when auth disabled", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "production";
    mutableEnv.AUTH_DISABLED = "1";
    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/");
    await expect(updateSession(req)).rejects.toThrow(
      "AUTH_DISABLED must never be enabled in production."
    );
  });

  it("returns unauthorized json for protected anonymous api requests", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/api/user/profile");
    const res = await updateSession(req);
    expect(res.status).toBe(401);
  });

  it("passes through /api/cron even while anonymous", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/api/cron/scheduler");
    const res = await updateSession(req);
    expect(res.status).toBe(200);
  });

  it("redirects anonymous root visits to login without guest cookie", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/");
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?next=%2F");
  });

  it("allows anonymous feed api when guest cookie is present", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/api/feed", {
      headers: {
        cookie: `${GUEST_ACCESS_COOKIE}=1`,
      },
    });
    const res = await updateSession(req);
    expect(res.status).toBe(200);
  });

  it("allows anonymous access to public article pages", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest(
      "http://localhost:3000/article/00000000-0000-4000-8000-000000000000"
    );
    const res = await updateSession(req);
    expect(res.status).toBe(200);
  });

  it("starts session clock for signed-in users when session start cookie is missing", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/profile");
    const res = await updateSession(req);

    expect(res.status).toBe(200);
    expect(res.cookies.get("gs_sess_start")?.value).toMatch(/^\d+$/);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("expires signed-in users when inferred sign-in time is older than session wall", async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.AUTH_DISABLED;
    mutableEnv.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    mutableEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-anon-key";
    const staleSignInIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-1", last_sign_in_at: staleSignInIso } },
    });

    const { updateSession } = await import("@/lib/supabase/middleware");
    const req = new NextRequest("http://localhost:3000/profile");
    const res = await updateSession(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(
      "/login?reason=session_expired&next=%2Fprofile"
    );
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });
});
