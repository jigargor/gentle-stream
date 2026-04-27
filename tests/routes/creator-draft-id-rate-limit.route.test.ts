import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireCreatorAccessMock = vi.fn();
const consumeRateLimitMock = vi.fn();
const hasTrustedOriginMock = vi.fn();

vi.mock("@/lib/auth/creator-security", () => ({
  isCreatorAccessDenied: (value: unknown) =>
    value != null && typeof value === "object" && "status" in (value as object),
  requireCreatorAccess: requireCreatorAccessMock,
}));

vi.mock("@/lib/security/origin", () => ({
  hasTrustedOrigin: hasTrustedOriginMock,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  buildRateLimitKey: ({ routeId }: { routeId: string }) => `key:${routeId}`,
  consumeRateLimit: consumeRateLimitMock,
  rateLimitExceededResponse: () => new Response("limited", { status: 429 }),
}));

vi.mock("@/lib/db/creatorDrafts", () => ({
  DraftConflictError: class DraftConflictError extends Error {},
  getCreatorDraftById: vi.fn().mockResolvedValue({
    id: "draft-1",
    userId: "creator-1",
    title: "Draft",
    body: "Draft body",
    contentKind: "user_article",
    articleType: null,
    articleTypeCustom: null,
    category: "world",
    locale: "global",
    explicitHashtags: [],
    pullQuote: "",
    privateNotes: null,
    contentHash: "hash",
    wordCount: 2,
    revision: 2,
    lastOpenedAt: new Date().toISOString(),
    neverSendToAi: false,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  markCreatorDraftOpened: vi.fn(),
  updateCreatorDraft: vi.fn().mockResolvedValue({
    id: "draft-1",
    revision: 3,
  }),
  createCreatorDraftVersion: vi.fn().mockResolvedValue(undefined),
  restoreCreatorDraftFromVersion: vi.fn(),
  purgeCreatorDraft: vi.fn().mockResolvedValue(undefined),
  softDeleteCreatorDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/creator", () => ({
  createSubmission: vi.fn(),
  getCreatorProfile: vi.fn(),
}));

vi.mock("@/lib/db/creatorStudio", () => ({
  createCreatorAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("/api/creator/drafts/[id] rate-limit policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCreatorAccessMock.mockResolvedValue({ userId: "creator-1" });
    consumeRateLimitMock.mockResolvedValue({ allowed: true });
    hasTrustedOriginMock.mockReturnValue(true);
  });

  it("GET uses creator-drafts-read policy", async () => {
    const { GET } = await import("@/app/api/creator/drafts/[id]/route");
    const request = new NextRequest("http://localhost/api/creator/drafts/draft-1");

    const response = await GET(request, { params: Promise.resolve({ id: "draft-1" }) });
    expect(response.status).toBe(200);
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ id: "creator-drafts-read" }),
      })
    );
  });

  it("PATCH uses creator-drafts-update policy", async () => {
    const { PATCH } = await import("@/app/api/creator/drafts/[id]/route");
    const request = new NextRequest("http://localhost/api/creator/drafts/draft-1", {
      method: "PATCH",
      body: JSON.stringify({ expectedRevision: 2, title: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "draft-1" }) });
    expect(response.status).toBe(200);
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ id: "creator-drafts-update" }),
      })
    );
  });

  it("DELETE uses creator-drafts-delete policy", async () => {
    const { DELETE } = await import("@/app/api/creator/drafts/[id]/route");
    const request = new NextRequest("http://localhost/api/creator/drafts/draft-1", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "draft-1" }) });
    expect(response.status).toBe(200);
    expect(consumeRateLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ id: "creator-drafts-delete" }),
      })
    );
  });
});
