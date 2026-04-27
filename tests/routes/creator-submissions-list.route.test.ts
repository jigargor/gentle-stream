import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const listCreatorSubmissionSummariesMock = vi.fn();
const listSubmissionsByAuthorMock = vi.fn();

const requireCreatorAccessMock = vi.fn();

vi.mock("@/lib/auth/creator-security", () => ({
  isCreatorAccessDenied: (value: unknown) =>
    value != null && typeof value === "object" && "status" in (value as object),
  requireCreatorAccess: requireCreatorAccessMock,
}));

vi.mock("@/lib/db/creator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/creator")>("@/lib/db/creator");
  return {
    ...actual,
    listCreatorSubmissionSummaries: listCreatorSubmissionSummariesMock,
    listSubmissionsByAuthor: listSubmissionsByAuthorMock,
  };
});

describe("GET /api/creator/submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCreatorAccessMock.mockResolvedValue({ userId: "creator-1" });
  });

  it("uses slim list when summary=1", async () => {
    listCreatorSubmissionSummariesMock.mockResolvedValueOnce({
      submissions: [{ id: "s1", headline: "Hi" }],
      nextCursor: null,
    });
    const { GET } = await import("@/app/api/creator/submissions/route");
    const request = new NextRequest("http://localhost/api/creator/submissions?summary=1&limit=5");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(listCreatorSubmissionSummariesMock).toHaveBeenCalledWith({
      authorUserId: "creator-1",
      limit: 5,
      cursorCreatedAt: null,
    });
    expect(listSubmissionsByAuthorMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      submissions: [{ id: "s1", headline: "Hi" }],
      nextCursor: null,
    });
  });

  it("uses full list path when summary is omitted", async () => {
    listSubmissionsByAuthorMock.mockResolvedValueOnce({
      submissions: [],
      nextCursor: null,
    });
    const { GET } = await import("@/app/api/creator/submissions/route");
    const request = new NextRequest("http://localhost/api/creator/submissions?limit=3");
    await GET(request);
    expect(listSubmissionsByAuthorMock).toHaveBeenCalledWith({
      authorUserId: "creator-1",
      limit: 3,
      cursorCreatedAt: null,
      includeBody: false,
    });
    expect(listCreatorSubmissionSummariesMock).not.toHaveBeenCalled();
  });
});
