import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/adminAuth";
import { createRssFeed, listRssFeeds } from "@/lib/db/rssFeeds";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const createFeedSchema = z.object({
  feedUrl: z.string().url(),
  publisher: z.string().max(160).nullish(),
  label: z.string().max(160).nullish(),
  categoryHint: z.string().max(120).nullish(),
  localeHint: z.string().max(48).nullish(),
  isEnabled: z.boolean().optional(),
  toneRiskScore: z.number().int().min(0).max(10).optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const feeds = await listRssFeeds();
  return NextResponse.json({ feeds });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = await parseJsonBody({
    request,
    schema: createFeedSchema,
  });
  if (!parsed.ok) return parsed.response;

  try {
    const created = await createRssFeed({
      feedUrl: parsed.data.feedUrl,
      publisher: parsed.data.publisher ?? undefined,
      label: parsed.data.label ?? undefined,
      categoryHint: parsed.data.categoryHint ?? undefined,
      localeHint: parsed.data.localeHint ?? undefined,
      isEnabled: parsed.data.isEnabled,
      toneRiskScore: parsed.data.toneRiskScore,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    console.error("[admin.rss-feeds.create] failed", error);
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Could not create RSS feed",
    });
  }
}

