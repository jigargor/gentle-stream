import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSessionUserIdMock = vi.fn();
const dbSelectMaybeSingleMock = vi.fn();
const dbDeleteEqMock = vi.fn();
const dbUpsertMock = vi.fn();

vi.mock("@/lib/api/sessionUser", () => ({
  getSessionUserId: getSessionUserIdMock,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: dbSelectMaybeSingleMock,
          })),
        })),
      })),
      upsert: dbUpsertMock,
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: dbDeleteEqMock,
        })),
      })),
    })),
  },
}));

describe("/api/user/game-save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated on PUT", async () => {
    getSessionUserIdMock.mockResolvedValueOnce(null);
    const { PUT } = await import("@/app/api/user/game-save/route");
    const req = new NextRequest("http://localhost/api/user/game-save", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    getSessionUserIdMock.mockResolvedValueOnce("u1");
    const { PUT } = await import("@/app/api/user/game-save/route");
    const req = new NextRequest("http://localhost/api/user/game-save", {
      method: "PUT",
      body: JSON.stringify({
        gameType: "invalid",
        difficulty: "easy",
        gameState: {},
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("returns ok for valid save payload", async () => {
    getSessionUserIdMock.mockResolvedValueOnce("u1");
    dbUpsertMock.mockResolvedValueOnce({ error: null });
    const { PUT } = await import("@/app/api/user/game-save/route");
    const req = new NextRequest("http://localhost/api/user/game-save", {
      method: "PUT",
      body: JSON.stringify({
        gameType: "sudoku",
        difficulty: "medium",
        elapsedSeconds: 12,
        gameState: { grid: [] },
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
  });
});
