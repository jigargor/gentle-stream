import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { ArticleStorageCategory } from "@/lib/constants";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import {
  countActiveDrafts,
  createCreatorDraft,
  listCreatorDraftSummaries,
  listCreatorDrafts,
} from "@/lib/db/creatorDrafts";
import { createCreatorAuditEvent } from "@/lib/db/creatorStudio";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const createDraftSchema = z
  .object({
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
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const search = request.nextUrl.searchParams;
    const limitRaw = Number.parseInt(search.get("limit") ?? "12", 10);
    const includeDeleted = search.get("includeDeleted") === "1";
    const summaryOnly = search.get("summary") === "1";
    const limit = Number.isFinite(limitRaw) ? limitRaw : 12;
    const cursor = search.get("cursor");
    const listStarted = Date.now();
    if (summaryOnly) {
      const { summaries, nextCursor } = await listCreatorDraftSummaries({
        userId: access.userId,
        limit,
        cursorUpdatedAt: cursor,
        includeDeleted,
      });
      if (Date.now() - listStarted > 25) {
        console.info(`[api-timing] GET /api/creator/drafts?summary=1 ${Date.now() - listStarted}ms`);
      }
      return NextResponse.json({ draftSummaries: summaries, nextCursor });
    }
    const { drafts, nextCursor } = await listCreatorDrafts({
      userId: access.userId,
      limit,
      cursorUpdatedAt: cursor,
      includeDeleted,
    });
    if (Date.now() - listStarted > 25) {
      console.info(`[api-timing] GET /api/creator/drafts ${Date.now() - listStarted}ms`);
    }
    return NextResponse.json({ drafts, nextCursor });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasTrustedOrigin(request)) {
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
        message: "Invalid request origin.",
      });
    }
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const rate = await consumeRateLimit({
      policy: { id: "creator-drafts-write", windowMs: 60_000, max: 25 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-drafts-create",
      }),
    });
    if (!rate.allowed) return rateLimitExceededResponse(rate, request);
    const parsed = createDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid draft payload.",
        details: parsed.error.flatten(),
      });
    }
    const env = getEnv();
    const maxDrafts = Math.max(
      1,
      Math.min(100, Math.trunc(env.CREATOR_MAX_DRAFTS_PER_USER ?? 10))
    );
    const activeCount = await countActiveDrafts(access.userId);
    if (activeCount >= maxDrafts) {
      return apiErrorResponse({
        request,
        status: 429,
        code: API_ERROR_CODES.RATE_LIMITED,
        message: `Draft limit reached (${maxDrafts}). Delete a draft before creating a new one.`,
      });
    }
    const body = parsed.data;
    const draft = await createCreatorDraft({
      userId: access.userId,
      title: body.title,
      body: body.body,
      contentKind: body.contentKind,
      articleType: body.articleType ?? null,
      articleTypeCustom: body.articleTypeCustom ?? null,
      category: body.category as ArticleStorageCategory | undefined,
      locale: body.locale,
      explicitHashtags: body.explicitHashtags,
      pullQuote: body.pullQuote,
      privateNotes: body.privateNotes ?? undefined,
      neverSendToAi: body.neverSendToAi,
    });
    try {
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "creator_draft_created",
        route: "/api/creator/drafts",
        targetId: draft.id,
        metadata: { contentKind: draft.contentKind },
      });
    } catch (error) {
      console.warn("[creator-drafts] audit event skipped", error);
    }
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
