import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import { createCreatorAuditEvent, getCreatorSettings, upsertCreatorSettings } from "@/lib/db/creatorStudio";

const settingsPatchSchema = z
  .object({
    modelMode: z.enum(["manual", "auto", "max"]).optional(),
    defaultProvider: z.enum(["anthropic", "openai", "gemini"]).nullable().optional(),
    defaultModel: z.string().trim().max(200).nullable().optional(),
    maxModeEnabled: z.boolean().optional(),
    maxModeBudgetCents: z.number().int().min(0).max(5_000_000).optional(),
    autocompleteEnabled: z.boolean().optional(),
    autocompletePrompt: z.string().max(2_000).optional(),
    autocompleteSensitiveDraftsBlocked: z.boolean().optional(),
    memoryEnabled: z.boolean().optional(),
    memoryRetentionDays: z.number().int().min(1).max(365).optional(),
    monthlyBudgetCents: z.number().int().min(0).max(10_000_000).optional(),
    dailyBudgetCents: z.number().int().min(0).max(2_000_000).optional(),
    perRequestBudgetCents: z.number().int().min(0).max(500_000).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const { settings, schemaAvailable } = await getCreatorSettings(access.userId);
    const res = NextResponse.json(settings);
    if (!schemaAvailable) {
      res.headers.set("X-Gentle-Stream-Creator-Db", "unavailable");
    }
    return res;
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;

    const rawAccess = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(rawAccess)) return rawAccess;

    const parsed = settingsPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid creator settings payload.",
        details: parsed.error.flatten(),
      });
    }

    const next = parsed.data;
    if (next.maxModeEnabled === true) {
      const stepUpAccess = await requireCreatorAccess(request, { requireStepUp: true });
      if (isCreatorAccessDenied(stepUpAccess)) return stepUpAccess;
    }

    const updated = await upsertCreatorSettings(rawAccess.userId, {
      modelMode: next.modelMode,
      defaultProvider: next.defaultProvider ?? undefined,
      defaultModel: next.defaultModel ?? undefined,
      maxModeEnabled: next.maxModeEnabled,
      maxModeBudgetCents: next.maxModeBudgetCents,
      autocompleteEnabled: next.autocompleteEnabled,
      autocompletePrompt: next.autocompletePrompt,
      autocompleteSensitiveDraftsBlocked: next.autocompleteSensitiveDraftsBlocked,
      memoryEnabled: next.memoryEnabled,
      memoryRetentionDays: next.memoryRetentionDays,
      monthlyBudgetCents: next.monthlyBudgetCents,
      dailyBudgetCents: next.dailyBudgetCents,
      perRequestBudgetCents: next.perRequestBudgetCents,
    });
    await createCreatorAuditEvent({
      userId: rawAccess.userId,
      actorUserId: rawAccess.userId,
      eventType: "creator_settings_updated",
      route: "/api/creator/settings",
      metadata: {
        modelMode: updated.modelMode,
        maxModeEnabled: updated.maxModeEnabled,
      },
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
