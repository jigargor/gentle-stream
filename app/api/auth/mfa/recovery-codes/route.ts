import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import {
  consumeCreatorRecoveryCode,
  createCreatorAuditEvent,
  listCreatorRecoveryCodeStates,
  regenerateCreatorRecoveryCodes,
} from "@/lib/db/creatorStudio";

const consumeBodySchema = z
  .object({
    code: z.string().trim().min(6).max(64),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;
    const codes = await listCreatorRecoveryCodeStates(access.userId);
    return NextResponse.json({
      count: codes.length,
      remaining: codes.filter((row) => !(row as { used_at?: string | null }).used_at).length,
      codes,
    });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}

export async function POST(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;
    const access = await requireCreatorAccess(request, { requireStepUp: true });
    if (isCreatorAccessDenied(access)) return access;
    const codes = await regenerateCreatorRecoveryCodes(access.userId);
    await createCreatorAuditEvent({
      userId: access.userId,
      actorUserId: access.userId,
      eventType: "mfa_recovery_codes_regenerated",
      route: "/api/auth/mfa/recovery-codes",
      metadata: { count: codes.length },
    });
    return NextResponse.json({ codes });
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
    const parsed = consumeBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid recovery code payload.",
      });
    }
    const ok = await consumeCreatorRecoveryCode({
      userId: access.userId,
      code: parsed.data.code,
    });
    if (!ok) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.INVALID_REQUEST,
        message: "Recovery code is invalid or already used.",
      });
    }
    await createCreatorAuditEvent({
      userId: access.userId,
      actorUserId: access.userId,
      eventType: "mfa_recovery_code_consumed",
      route: "/api/auth/mfa/recovery-codes",
    });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
