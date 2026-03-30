import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    rpc: rpcMock,
  },
}));

describe("rateLimit adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses distributed rpc result when available", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          allowed: true,
          remaining: 9,
          retry_after_sec: 42,
          reset_at: new Date(Date.now() + 42_000).toISOString(),
        },
      ],
      error: null,
    });
    const { consumeRateLimit } = await import("@/lib/security/rateLimit");
    const result = await consumeRateLimit({
      policy: { id: "t", windowMs: 60_000, max: 10 },
      key: "k",
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.retryAfterSec).toBe(42);
  });

  it("falls back to in-memory limiter when rpc fails", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "missing function" } });
    const { consumeRateLimit } = await import("@/lib/security/rateLimit");
    const result = await consumeRateLimit({
      policy: { id: "fallback", windowMs: 60_000, max: 2 },
      key: "bucket",
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });
});
