import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import {
  createCreatorDraftVersion,
  getCreatorDraftById,
  listCreatorDraftVersions,
} from "@/lib/db/creatorDrafts";
import { createCreatorAuditEvent } from "@/lib/db/creatorStudio";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const checkpointSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
  })
  .strict();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;
    const rate = await consumeRateLimit({
      policy: { id: "creator-drafts-checkpoint", windowMs: 60_000, max: 20 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-drafts-versions",
      }),
    });
    if (!rate.allowed) return rateLimitExceededResponse(rate, request);
    const versions = await listCreatorDraftVersions({
      userId: access.userId,
      draftId: params.id,
      limit: 100,
    });
    return NextResponse.json({ versions });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!hasTrustedOrigin(request)) {
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
        message: "Invalid request origin.",
      });
    }
    const params = await context.params;
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;
    const parsed = checkpointSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid checkpoint payload.",
        details: parsed.error.flatten(),
      });
    }
    const draft = await getCreatorDraftById({
      userId: access.userId,
      draftId: params.id,
    });
    if (!draft || draft.deletedAt) {
      return apiErrorResponse({
        request,
        status: 404,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "Draft not found.",
      });
    }
    if (draft.revision !== parsed.data.expectedRevision) {
      return apiErrorResponse({
        request,
        status: 409,
        code: API_ERROR_CODES.VALIDATION,
        message: "Draft changed before checkpoint was created.",
      });
    }
    const version = await createCreatorDraftVersion({
      draft,
      reason: "manual_checkpoint",
    });
    await createCreatorAuditEvent({
      userId: access.userId,
      actorUserId: access.userId,
      eventType: "creator_draft_checkpoint_created",
      route: "/api/creator/drafts/[id]/versions",
      targetId: params.id,
      metadata: { revision: draft.revision },
    });
    return NextResponse.json({ version }, { status: 201 });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
