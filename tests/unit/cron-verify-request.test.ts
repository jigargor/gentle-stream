import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function buildRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("https://example.com/api/cron/scheduler", { headers });
}

describe("isAuthorizedCronRequest", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.CRON_SECRET = originalCronSecret;
    vi.restoreAllMocks();
  });

  it("returns false when cron secret is missing", async () => {
    delete process.env.CRON_SECRET;
    const { isAuthorizedCronRequest } = await import("@/lib/cron/verifyRequest");
    const request = buildRequest({ authorization: "Bearer test-secret" });
    expect(isAuthorizedCronRequest(request)).toBe(false);
  });

  it("returns false when bearer token does not match", async () => {
    const { isAuthorizedCronRequest } = await import("@/lib/cron/verifyRequest");
    const request = buildRequest({ authorization: "Bearer wrong-secret" });
    expect(isAuthorizedCronRequest(request)).toBe(false);
  });

  it("returns true in production with valid secret even without cron ip headers", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { isAuthorizedCronRequest } = await import("@/lib/cron/verifyRequest");
    const request = buildRequest({ authorization: "Bearer test-secret" });

    expect(isAuthorizedCronRequest(request)).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("returns true in production with allowed vercel ip and valid secret", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { isAuthorizedCronRequest } = await import("@/lib/cron/verifyRequest");
    const request = buildRequest({
      authorization: "Bearer test-secret",
      "x-vercel-forwarded-for": "76.76.21.24",
    });

    expect(isAuthorizedCronRequest(request)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
