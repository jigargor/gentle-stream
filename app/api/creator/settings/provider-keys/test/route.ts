import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import { createCreatorAuditEvent, getCreatorProviderApiKey } from "@/lib/db/creatorStudio";
import { generateLlmText } from "@/lib/llm/client";

const schema = z
  .object({
    provider: z.enum(["anthropic", "openai", "gemini"]),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;
    const access = await requireCreatorAccess(request, { requireStepUp: true });
    if (isCreatorAccessDenied(access)) return access;

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid provider key test payload.",
        details: parsed.error.flatten(),
      });
    }

    const apiKey = await getCreatorProviderApiKey({
      userId: access.userId,
      provider: parsed.data.provider,
    });
    if (!apiKey) {
      return apiErrorResponse({
        request,
        status: 404,
        code: API_ERROR_CODES.NOT_FOUND,
        message: "No active key found for this provider.",
      });
    }

    await generateLlmText({
      provider: parsed.data.provider,
      providerApiKeys: { [parsed.data.provider]: apiKey },
      callKind: "creator_key_test",
      route: "app/api/creator/settings/provider-keys/test",
      userId: access.userId,
      workflowId: "settings_key_test",
      prompt: "Reply with the single word: ready",
      maxTokens: 16,
      temperature: 0,
      timeoutMs: 12_000,
    });
    await createCreatorAuditEvent({
      userId: access.userId,
      actorUserId: access.userId,
      eventType: "provider_key_tested",
      targetId: parsed.data.provider,
      route: "/api/creator/settings/provider-keys/test",
    });
    return NextResponse.json({ ok: true, provider: parsed.data.provider, status: "healthy" });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
