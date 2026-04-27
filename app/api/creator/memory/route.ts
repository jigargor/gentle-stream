import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import {
  createCreatorAuditEvent,
  createCreatorMemorySession,
  CreatorStudioSchemaUnavailableError,
  deleteCreatorMemory,
  getCreatorSettings,
  listCreatorMemory,
  listCreatorMemorySummaries,
  upsertCreatorMemorySummary,
} from "@/lib/db/creatorStudio";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const createMemoryBodySchema = z
  .object({
    workflowId: z.string().trim().min(1).max(120),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().min(1).max(8_000),
    containsPii: z.boolean().optional(),
  })
  .strict();

const summaryBodySchema = z
  .object({
    workflowId: z.string().trim().min(1).max(120),
    summary: z.string().min(1).max(8_000),
    sourceCount: z.number().int().min(0).max(10_000),
  })
  .strict();

const deleteBodySchema = z
  .object({
    workflowId: z.string().trim().min(1).max(120).optional(),
    exportOnly: z.boolean().optional().default(false),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const workflowId = request.nextUrl.searchParams.get("workflowId")?.trim() || undefined;
    const [sessions, summaries] = await Promise.all([
      listCreatorMemory({ userId: access.userId, workflowId, limit: 200 }),
      listCreatorMemorySummaries({ userId: access.userId, workflowId, limit: 100 }),
    ]);
    return NextResponse.json({ sessions, summaries });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function POST(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const parsed = createMemoryBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid memory payload.",
        details: parsed.error.flatten(),
      });
    }
    const { settings, schemaAvailable } = await getCreatorSettings(access.userId);
    if (!schemaAvailable) {
      return internalErrorResponse({ request, error: new CreatorStudioSchemaUnavailableError() });
    }
    if (!settings.memoryEnabled) {
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "Memory is disabled in Creator Settings.",
      });
    }
    const memory = await createCreatorMemorySession({
      userId: access.userId,
      workflowId: parsed.data.workflowId,
      role: parsed.data.role,
      content: parsed.data.content,
      containsPii: parsed.data.containsPii,
      retentionDays: settings.memoryRetentionDays,
    });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const parsed = summaryBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid memory summary payload.",
        details: parsed.error.flatten(),
      });
    }
    const { settings, schemaAvailable } = await getCreatorSettings(access.userId);
    if (!schemaAvailable) {
      return internalErrorResponse({ request, error: new CreatorStudioSchemaUnavailableError() });
    }
    const summary = await upsertCreatorMemorySummary({
      userId: access.userId,
      workflowId: parsed.data.workflowId,
      summary: parsed.data.summary,
      sourceCount: parsed.data.sourceCount,
      retentionDays: settings.memoryRetentionDays,
    });
    return NextResponse.json({ summary });
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
    const deleteRate = await consumeRateLimit({
      policy: { id: "creator-memory-delete", windowMs: 60_000, max: 12 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-memory-delete",
      }),
    });
    if (!deleteRate.allowed) return rateLimitExceededResponse(deleteRate, request);

    const parsed = deleteBodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid memory deletion payload.",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    const sessions = await listCreatorMemory({
      userId: access.userId,
      workflowId: body.workflowId,
      limit: 400,
    });
    const summaries = await listCreatorMemorySummaries({
      userId: access.userId,
      workflowId: body.workflowId,
      limit: 200,
    });
    if (!body.exportOnly) {
      await deleteCreatorMemory({
        userId: access.userId,
        workflowId: body.workflowId,
      });
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "creator_memory_deleted",
        route: "/api/creator/memory",
        metadata: {
          workflowId: body.workflowId ?? null,
          sessionCount: sessions.length,
          summaryCount: summaries.length,
        },
      });
    } else {
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "creator_memory_exported",
        route: "/api/creator/memory",
        metadata: {
          workflowId: body.workflowId ?? null,
          sessionCount: sessions.length,
          summaryCount: summaries.length,
        },
      });
    }
    return NextResponse.json({
      export: {
        sessions,
        summaries,
      },
      deleted: !body.exportOnly,
    });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
