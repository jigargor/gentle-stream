import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { reviewSubmission } from "@/lib/db/creator";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const rejectBodySchema = z.object({
  adminNote: z.string().max(500).nullish(),
  rejectionReason: z.string().max(500).nullish(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN,
      message: "Admin access required",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: rejectBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const adminNote =
    typeof body.adminNote === "string" && body.adminNote.trim()
      ? body.adminNote.trim().slice(0, 500)
      : null;
  const rejectionReason =
    typeof body.rejectionReason === "string" && body.rejectionReason.trim()
      ? body.rejectionReason.trim().slice(0, 500)
      : "Rejected by moderator";

  try {
    const reviewed = await reviewSubmission({
      submissionId: params.id,
      reviewerUserId: user.id,
      action: "reject",
      adminNote,
      rejectionReason,
    });
    return NextResponse.json(reviewed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("pending")
      ? 409
      : message.includes("not found")
        ? 404
        : 500;
    return apiErrorResponse({
      request,
      status,
      code:
        status === 404
          ? API_ERROR_CODES.NOT_FOUND
          : status === 409
            ? API_ERROR_CODES.INVALID_REQUEST
            : API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
