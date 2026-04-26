import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();

vi.mock("@/lib/api/adminAuth", () => ({
  requireAdmin: requireAdminMock,
}));

interface AdminRouteCase {
  label: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  modulePath: string;
  url: string;
  body?: Record<string, unknown>;
  context?: { params: Promise<{ id: string }> };
}

const routeCases: AdminRouteCase[] = [
  {
    label: "moderation list",
    method: "GET",
    modulePath: "@/app/api/admin/articles/moderation/route",
    url: "http://localhost/api/admin/articles/moderation",
  },
  {
    label: "moderation approve",
    method: "POST",
    modulePath: "@/app/api/admin/articles/moderation/[id]/approve/route",
    url: "http://localhost/api/admin/articles/moderation/article-1/approve",
    body: { note: "ok" },
    context: { params: Promise.resolve({ id: "article-1" }) },
  },
  {
    label: "moderation reject",
    method: "POST",
    modulePath: "@/app/api/admin/articles/moderation/[id]/reject/route",
    url: "http://localhost/api/admin/articles/moderation/article-1/reject",
    body: { reason: "bad data", note: "rejecting" },
    context: { params: Promise.resolve({ id: "article-1" }) },
  },
  {
    label: "moderation restore",
    method: "POST",
    modulePath: "@/app/api/admin/articles/moderation/[id]/restore/route",
    url: "http://localhost/api/admin/articles/moderation/article-1/restore",
    body: { note: "undo reject" },
    context: { params: Promise.resolve({ id: "article-1" }) },
  },
  {
    label: "submissions list",
    method: "GET",
    modulePath: "@/app/api/admin/submissions/route",
    url: "http://localhost/api/admin/submissions",
  },
  {
    label: "submissions approve",
    method: "POST",
    modulePath: "@/app/api/admin/submissions/[id]/approve/route",
    url: "http://localhost/api/admin/submissions/sub-1/approve",
    body: { adminNote: "ok", rejectionReason: null },
    context: { params: Promise.resolve({ id: "sub-1" }) },
  },
  {
    label: "submissions reject",
    method: "POST",
    modulePath: "@/app/api/admin/submissions/[id]/reject/route",
    url: "http://localhost/api/admin/submissions/sub-1/reject",
    body: { adminNote: "no", rejectionReason: "insufficient sourcing" },
    context: { params: Promise.resolve({ id: "sub-1" }) },
  },
  {
    label: "submissions request changes",
    method: "POST",
    modulePath: "@/app/api/admin/submissions/[id]/request-changes/route",
    url: "http://localhost/api/admin/submissions/sub-1/request-changes",
    body: { adminNote: "please revise" },
    context: { params: Promise.resolve({ id: "sub-1" }) },
  },
  {
    label: "rss feeds list",
    method: "GET",
    modulePath: "@/app/api/admin/rss-feeds/route",
    url: "http://localhost/api/admin/rss-feeds",
  },
  {
    label: "rss feeds create",
    method: "POST",
    modulePath: "@/app/api/admin/rss-feeds/route",
    url: "http://localhost/api/admin/rss-feeds",
    body: {
      feedUrl: "https://example.com/rss.xml",
      publisher: "Example",
      label: "example feed",
      categoryHint: "Technology",
      localeHint: "en-US",
    },
  },
  {
    label: "rss feeds update",
    method: "PATCH",
    modulePath: "@/app/api/admin/rss-feeds/[id]/route",
    url: "http://localhost/api/admin/rss-feeds/550e8400-e29b-41d4-a716-446655440000",
    body: {
      label: "updated",
      categoryHint: "Science & Discovery",
    },
    context: {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    },
  },
  {
    label: "rss feeds delete",
    method: "DELETE",
    modulePath: "@/app/api/admin/rss-feeds/[id]/route",
    url: "http://localhost/api/admin/rss-feeds/550e8400-e29b-41d4-a716-446655440000",
    context: {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    },
  },
  {
    label: "feedback list",
    method: "GET",
    modulePath: "@/app/api/admin/feedback/route",
    url: "http://localhost/api/admin/feedback",
  },
];

async function callAdminRoute(routeCase: AdminRouteCase) {
  const headers =
    routeCase.body !== undefined ? { "Content-Type": "application/json" } : undefined;
  const request = new NextRequest(routeCase.url, {
    method: routeCase.method,
    headers,
    body: routeCase.body !== undefined ? JSON.stringify(routeCase.body) : undefined,
  });
  const routeModule = (await import(routeCase.modulePath)) as Record<
    string,
    (req: NextRequest, context?: { params: Promise<{ id: string }> }) => Promise<Response>
  >;
  return routeModule[routeCase.method](request, routeCase.context);
}

describe("/api/admin route authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const routeCase of routeCases) {
    it(`returns 401 for unauthenticated ${routeCase.label} (${routeCase.method})`, async () => {
      const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      requireAdminMock.mockResolvedValueOnce({ ok: false, response: unauthorized });

      const response = await callAdminRoute(routeCase);
      expect(response.status).toBe(401);
    });

    it(`returns 403 for non-admin ${routeCase.label} (${routeCase.method})`, async () => {
      const forbidden = NextResponse.json({ error: "Admin access required" }, { status: 403 });
      requireAdminMock.mockResolvedValueOnce({ ok: false, response: forbidden });

      const response = await callAdminRoute(routeCase);
      expect(response.status).toBe(403);
    });
  }
});
