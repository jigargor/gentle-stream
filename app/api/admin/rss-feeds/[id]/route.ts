import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/adminAuth";
import { deleteRssFeed, updateRssFeed } from "@/lib/db/rssFeeds";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const patchFeedSchema = z.object({
  feedUrl: z.string().url().optional(),
  publisher: z.string().max(160).optional(),
  label: z.string().max(160).optional(),
  categoryHint: z.string().max(120).optional(),
  localeHint: z.string().max(48).optional(),
  isEnabled: z.boolean().optional(),
  toneRiskScore: z.number().int().min(0).max(10).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success)
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid RSS feed id",
    });

  const parsed = await parseJsonBody({
    request,
    schema: patchFeedSchema,
  });
  if (!parsed.ok) return parsed.response;
  try {
    const updated = await updateRssFeed(params.data.id, parsed.data);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("[admin.rss-feeds.update] failed", error);
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Could not update RSS feed",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success)
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid RSS feed id",
    });
  try {
    await deleteRssFeed(params.data.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("[admin.rss-feeds.delete] failed", error);
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Could not delete RSS feed",
    });
  }
}

