import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/adminAuth";
import { reviewSubmission } from "@/lib/db/creator";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";

const requestChangesBodySchema = z.object({
  adminNote: z.string().max(800).nullish(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const parsedBody = await parseJsonBody({
    request,
    schema: requestChangesBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const adminNote =
    typeof body.adminNote === "string" && body.adminNote.trim()
      ? body.adminNote.trim().slice(0, 800)
      : "Please revise this draft based on moderation guidance and resubmit.";

  try {
    const reviewed = await reviewSubmission({
      submissionId: params.id,
      reviewerUserId: admin.userId,
      action: "request_changes",
      adminNote,
      rejectionReason: null,
    });
    return NextResponse.json(reviewed);
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : "";
    const status = rawMessage.includes("pending")
      ? 409
      : rawMessage.includes("not found")
        ? 404
        : 500;
    if (status === 404) {
      return apiErrorResponse({
        request,
        status,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Not found",
      });
    }
    if (status === 409) {
      return apiErrorResponse({
        request,
        status,
        code: API_ERROR_CODES.INVALID_REQUEST,
        message: "Submission must be pending",
      });
    }
    return internalErrorResponse({ request, error });
  }
}
