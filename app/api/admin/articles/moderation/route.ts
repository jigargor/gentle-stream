import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";
import {
  type ModerationQueueFilter,
  listArticlesForModeration,
} from "@/lib/db/articleModeration";
import { internalErrorResponse } from "@/lib/api/errors";

function parseFilter(value: string | null): ModerationQueueFilter {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "flagged" ||
    value === "rejected"
  ) {
    return value;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const filter = parseFilter(url.searchParams.get("status"));
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  try {
    const items = await listArticlesForModeration({ filter, limit });
    return NextResponse.json({ items });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
