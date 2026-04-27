import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import { createCreatorAuditEvent } from "@/lib/db/creatorStudio";

const deleteSchema = z
  .object({
    includeTelemetry: z.boolean().optional().default(true),
    includeDrafts: z.boolean().optional().default(true),
    includeMemory: z.boolean().optional().default(true),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;
    const userId = access.userId;
    const [drafts, draftVersions, memorySessions, memorySummaries, llmCalls] =
      await Promise.all([
        db.from("creator_drafts").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        db.from("creator_draft_versions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        db.from("creator_memory_sessions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        db.from("creator_memory_summaries").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        db.from("llm_provider_calls").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
      ]);
    await createCreatorAuditEvent({
      userId,
      actorUserId: userId,
      eventType: "creator_data_exported",
      route: "/api/creator/data-portability",
      metadata: {
        draftCount: drafts.data?.length ?? 0,
        versionCount: draftVersions.data?.length ?? 0,
        memoryCount: (memorySessions.data?.length ?? 0) + (memorySummaries.data?.length ?? 0),
        llmCallCount: llmCalls.data?.length ?? 0,
      },
    });
    return NextResponse.json({
      export: {
        drafts: drafts.data ?? [],
        draftVersions: draftVersions.data ?? [],
        memorySessions: memorySessions.data ?? [],
        memorySummaries: memorySummaries.data ?? [],
        llmProviderCalls: llmCalls.data ?? [],
      },
    });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;
    const access = await requireCreatorAccess(request, { requireStepUp: true });
    if (isCreatorAccessDenied(access)) return access;
    const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid delete payload.",
        details: parsed.error.flatten(),
      });
    }
    const userId = access.userId;
    if (parsed.data.includeDrafts) {
      await db.from("creator_draft_versions").delete().eq("user_id", userId);
      await db.from("creator_drafts").delete().eq("user_id", userId);
    }
    if (parsed.data.includeMemory) {
      await db.from("creator_memory_sessions").delete().eq("user_id", userId);
      await db.from("creator_memory_summaries").delete().eq("user_id", userId);
    }
    if (parsed.data.includeTelemetry) {
      await db.from("llm_provider_calls").delete().eq("user_id", userId);
    }
    await createCreatorAuditEvent({
      userId,
      actorUserId: userId,
      eventType: "creator_data_deleted",
      route: "/api/creator/data-portability",
      metadata: {
        includeDrafts: parsed.data.includeDrafts,
        includeMemory: parsed.data.includeMemory,
        includeTelemetry: parsed.data.includeTelemetry,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
