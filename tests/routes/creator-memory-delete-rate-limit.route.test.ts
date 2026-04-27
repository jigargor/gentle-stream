import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCreatorAccessMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const assertCreatorMutationOriginMock = vi.fn();

vi.mock("@/lib/auth/creator-security", () => ({
  assertCreatorMutationOrigin: assertCreatorMutationOriginMock,
  isCreatorAccessDenied: (value: unknown) =>
    value != null && typeof value === "object" && "status" in (value as object),
  requireCreatorAccess: requireCreatorAccessMock,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  buildRateLimitKey: ({ routeId }: { routeId: string }) => `key:${routeId}`,
  consumeRateLimit: consumeRateLimitMock,
  rateLimitExceededResponse: () => new Response("limited", { status: 429 }),
}));

vi.mock("@/lib/db/creatorStudio", () => ({
  listCreatorMemory: vi.fn().mockResolvedValue([]),
  listCreatorMemorySummaries: vi.fn().mockResolvedValue([]),
  deleteCreatorMemory: vi.fn().mockResolvedValue(undefined),
  createCreatorAuditEvent: vi.fn().mockResolvedValue(undefined),
  createCreatorMemorySession: vi.fn(),
  getCreatorSettings: vi.fn(),
  upsertCreatorMemorySummary: vi.fn(),
  CreatorStudioSchemaUnavailableError: class CreatorStudioSchemaUnavailableError extends Error {},
}));

describe("DELETE /api/creator/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertCreatorMutationOriginMock.mockReturnValue(null);
    requireCreatorAccessMock.mockResolvedValue({ userId: "creator-1" });
    consumeRateLimitMock.mockResolvedValue({ allowed: true });
  });

  it("applies delete-specific rate limiting before mutation", async () => {
    const { DELETE } = await import("@/app/api/creator/memory/route");
    const request = new NextRequest("http://localhost/api/creator/memory", {
      method: "DELETE",
      body: JSON.stringify({ exportOnly: true }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ id: "creator-memory-delete" }),
      })
    );
  });
});
