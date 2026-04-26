import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/adminAuth";
import { approveModeratedArticle } from "@/lib/db/articleModeration";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";

const bodySchema = z.object({
  note: z.string().max(500).nullish(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsedBody = await parseJsonBody({ request, schema: bodySchema });
  if (!parsedBody.ok) return parsedBody.response;
  const note =
    typeof parsedBody.data.note === "string" && parsedBody.data.note.trim()
      ? parsedBody.data.note.trim().slice(0, 500)
      : null;

  try {
    const result = await approveModeratedArticle({
      articleId: params.id,
      reviewerUserId: admin.userId,
      note,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : "";
    const status = rawMessage.includes("not found") ? 404 : 500;
    if (status === 404) {
      return apiErrorResponse({
        request,
        status,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Not found",
      });
    }
    return internalErrorResponse({ request, error });
  }
}
