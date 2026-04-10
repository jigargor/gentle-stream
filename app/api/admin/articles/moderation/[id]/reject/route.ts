import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { rejectModeratedArticle } from "@/lib/db/articleModeration";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const bodySchema = z.object({
  reason: z.string().max(500).nullish(),
  note: z.string().max(500).nullish(),
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

  const parsedBody = await parseJsonBody({ request, schema: bodySchema });
  if (!parsedBody.ok) return parsedBody.response;
  const note =
    typeof parsedBody.data.note === "string" && parsedBody.data.note.trim()
      ? parsedBody.data.note.trim().slice(0, 500)
      : null;
  const reason =
    typeof parsedBody.data.reason === "string" && parsedBody.data.reason.trim()
      ? parsedBody.data.reason.trim().slice(0, 500)
      : "Rejected by admin moderator";

  try {
    const result = await rejectModeratedArticle({
      articleId: params.id,
      reviewerUserId: user.id,
      reason,
      note,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return apiErrorResponse({
      request,
      status,
      code: status === 404 ? API_ERROR_CODES.NOT_FOUND : API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
