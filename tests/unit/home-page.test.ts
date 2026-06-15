import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const cookieGetMock = vi.fn();
const redirectMock = vi.fn();
const getEnvMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieGetMock,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/env", () => ({
  getEnv: getEnvMock,
}));

describe("app/page guest precedence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockReset();
    cookieGetMock.mockReset();
    redirectMock.mockReset();
    getEnvMock.mockReturnValue({ FEED_INCLUDE_USER_SUBMITTED: false });
  });

  it("renders anonymous feed when guest cookie exists, even if user session exists", async () => {
    process.env.AUTH_DISABLED = "0";
    cookieGetMock.mockReturnValueOnce({ value: "1" });
    getUserMock.mockResolvedValueOnce({
      data: {
        user: { id: "user-123", email: "reader@example.com" },
      },
    });
    const { default: Home } = await import("@/app/page");

    const element = await Home();

    expect(getUserMock).not.toHaveBeenCalled();
    expect(element.props.userId).toBe("anonymous");
    expect(element.props.userEmail).toBeNull();
  });

  it("redirects to login when not guest and unauthenticated", async () => {
    process.env.AUTH_DISABLED = "0";
    cookieGetMock.mockReturnValueOnce(undefined);
    getUserMock.mockResolvedValueOnce({
      data: {
        user: null,
      },
    });
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
    const { default: Home } = await import("@/app/page");

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login?next=/");
  });
});
