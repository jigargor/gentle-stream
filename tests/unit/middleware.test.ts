import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
});
