import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ArticleStorageCategory } from "@/lib/constants";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import {
  createCreatorDraftVersion,
  DraftConflictError,
  getCreatorDraftById,
  markCreatorDraftOpened,
  purgeCreatorDraft,
  restoreCreatorDraftFromVersion,
  softDeleteCreatorDraft,
  updateCreatorDraft,
} from "@/lib/db/creatorDrafts";
import { createSubmission } from "@/lib/db/creator";
import { createCreatorAuditEvent } from "@/lib/db/creatorStudio";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const draftPatchSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    title: z.string().max(280).optional(),
    body: z.string().max(60_000).optional(),
    contentKind: z.enum(["user_article", "recipe"]).optional(),
    articleType: z.string().max(120).nullable().optional(),
    articleTypeCustom: z.string().max(160).nullable().optional(),
    category: z.string().max(80).optional(),
    locale: z.string().max(64).optional(),
    explicitHashtags: z.array(z.string().max(64)).optional(),
    pullQuote: z.string().max(500).optional(),
    privateNotes: z.string().max(6_000).nullable().optional(),
    neverSendToAi: z.boolean().optional(),
    autosave: z.boolean().optional(),
    action: z.enum(["restore", "publish"]).optional(),
    restoreVersionId: z.string().uuid().optional(),
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
    const readRate = await consumeRateLimit({
      policy: { id: "creator-drafts-read", windowMs: 60_000, max: 180 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-drafts-read",
      }),
    });
    if (!readRate.allowed) return rateLimitExceededResponse(readRate, request);
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
    void markCreatorDraftOpened({ userId: access.userId, draftId: params.id });
    return NextResponse.json({ draft });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function PATCH(
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
    const patchRate = await consumeRateLimit({
      policy: { id: "creator-drafts-update", windowMs: 60_000, max: 60 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-drafts-update",
      }),
    });
    if (!patchRate.allowed) return rateLimitExceededResponse(patchRate, request);
    const parsed = draftPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid draft payload.",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    if (body.action === "restore") {
      if (!body.restoreVersionId) {
        return apiErrorResponse({
          request,
          status: 400,
          code: API_ERROR_CODES.MISSING_FIELD,
          message: "restoreVersionId is required for restore action.",
        });
      }
      const restored = await restoreCreatorDraftFromVersion({
        userId: access.userId,
        draftId: params.id,
        versionId: body.restoreVersionId,
        expectedRevision: body.expectedRevision,
      });
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "creator_draft_restored",
        route: "/api/creator/drafts/[id]",
        targetId: params.id,
        metadata: { revision: restored.revision },
      });
      return NextResponse.json({ draft: restored });
    }

    if (body.action === "publish") {
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
      if (draft.revision !== body.expectedRevision) throw new DraftConflictError();
      const submission = await createSubmission({
        authorUserId: access.userId,
        headline: draft.title.trim(),
        subheadline: "",
        body: draft.body,
        pullQuote: draft.pullQuote,
        category: draft.category,
        contentKind: draft.contentKind,
        locale: draft.locale,
        explicitHashtags: draft.explicitHashtags,
        articleType: draft.articleType ?? null,
        articleTypeCustom: draft.articleTypeCustom ?? null,
      });
      await createCreatorDraftVersion({
        draft,
        reason: "publish",
      });
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "creator_draft_published",
        route: "/api/creator/drafts/[id]",
        targetId: params.id,
        metadata: { submissionId: submission.id },
      });
      return NextResponse.json({ submission });
    }

    const updated = await updateCreatorDraft({
      userId: access.userId,
      draftId: params.id,
      expectedRevision: body.expectedRevision,
      title: body.title,
      body: body.body,
      contentKind: body.contentKind,
      articleType: body.articleType ?? undefined,
      articleTypeCustom: body.articleTypeCustom ?? undefined,
      category: body.category as ArticleStorageCategory | undefined,
      locale: body.locale,
      explicitHashtags: body.explicitHashtags,
      pullQuote: body.pullQuote,
      privateNotes: body.privateNotes ?? undefined,
      neverSendToAi: body.neverSendToAi,
    });
    if (body.autosave !== true) {
      await createCreatorDraftVersion({
        draft: updated,
        reason: "manual_checkpoint",
      });
    }
    return NextResponse.json({ draft: updated });
  } catch (error: unknown) {
    if (error instanceof DraftConflictError) {
      return apiErrorResponse({
        request,
        status: 409,
        code: API_ERROR_CODES.VALIDATION,
        message: error.message,
      });
    }
    return internalErrorResponse({ request, error });
  }
}

export async function DELETE(
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
    const deleteRate = await consumeRateLimit({
      policy: { id: "creator-drafts-delete", windowMs: 60_000, max: 20 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-drafts-delete",
      }),
    });
    if (!deleteRate.allowed) return rateLimitExceededResponse(deleteRate, request);
    const shouldPurge = request.nextUrl.searchParams.get("purge") === "1";
    if (shouldPurge) {
      await purgeCreatorDraft({ userId: access.userId, draftId: params.id });
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "creator_draft_purged",
        route: "/api/creator/drafts/[id]",
        targetId: params.id,
      });
      return NextResponse.json({ ok: true, purged: true });
    }
    await softDeleteCreatorDraft({ userId: access.userId, draftId: params.id });
    await createCreatorAuditEvent({
      userId: access.userId,
      actorUserId: access.userId,
      eventType: "creator_draft_deleted",
      route: "/api/creator/drafts/[id]",
      targetId: params.id,
    });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
