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
  deleteCreatorProviderKey,
  listCreatorProviderKeys,
  setCreatorProviderKeyStatus,
  upsertCreatorProviderKey,
} from "@/lib/db/creatorStudio";

const providerKeyWriteSchema = z
  .object({
    provider: z.enum(["anthropic", "openai", "gemini"]),
    apiKey: z.string().trim().min(8).max(600).optional(),
    action: z.enum(["upsert", "revoke", "delete"]).default("upsert"),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;
    const { keys, schemaAvailable } = await listCreatorProviderKeys(access.userId);
    const res = NextResponse.json({ keys });
    if (!schemaAvailable) {
      res.headers.set("X-Gentle-Stream-Creator-Db", "unavailable");
    }
    return res;
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

    const parsed = providerKeyWriteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid BYOK payload.",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    if (body.action === "delete") {
      await deleteCreatorProviderKey({
        userId: access.userId,
        provider: body.provider,
      });
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "provider_key_deleted",
        route: "/api/creator/settings/provider-keys",
        targetId: body.provider,
      });
      return NextResponse.json({ ok: true, status: "deleted" });
    }
    if (body.action === "revoke") {
      const key = await setCreatorProviderKeyStatus({
        userId: access.userId,
        provider: body.provider,
        status: "revoked",
      });
      await createCreatorAuditEvent({
        userId: access.userId,
        actorUserId: access.userId,
        eventType: "provider_key_revoked",
        route: "/api/creator/settings/provider-keys",
        targetId: body.provider,
      });
      return NextResponse.json({ key, status: "revoked" });
    }
    if (!body.apiKey) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "apiKey is required for upsert.",
      });
    }
    const key = await upsertCreatorProviderKey({
      userId: access.userId,
      provider: body.provider,
      apiKey: body.apiKey,
    });
    await createCreatorAuditEvent({
      userId: access.userId,
      actorUserId: access.userId,
      eventType: "provider_key_upserted",
      route: "/api/creator/settings/provider-keys",
      targetId: body.provider,
      metadata: { last4: key.last4 },
    });
    return NextResponse.json({ key });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
