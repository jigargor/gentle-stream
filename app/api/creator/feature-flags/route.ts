import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import {
  listEffectiveCreatorFeatureFlags,
  upsertUserCreatorFeatureFlag,
} from "@/lib/db/creatorFeatureFlags";

const patchSchema = z
  .object({
    flagKey: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;
    const flags = await listEffectiveCreatorFeatureFlags({
      userId: access.userId,
      cohorts: ["creator_default"],
    });
    return NextResponse.json({ flags });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid feature flag payload.",
        details: parsed.error.flatten(),
      });
    }
    await upsertUserCreatorFeatureFlag({
      userId: access.userId,
      flagKey: parsed.data.flagKey,
      enabled: parsed.data.enabled,
    });
    const flags = await listEffectiveCreatorFeatureFlags({
      userId: access.userId,
      cohorts: ["creator_default"],
    });
    return NextResponse.json({ flags });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
