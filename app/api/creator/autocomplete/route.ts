import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";
import {
  createCreatorMemorySession,
  CreatorStudioSchemaUnavailableError,
  getCreatorSettings,
  listCreatorMemory,
} from "@/lib/db/creatorStudio";
import { generateCreatorText } from "@/lib/creator/model-router";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const autocompleteBodySchema = z
  .object({
    headline: z.string().max(280).optional(),
    articleType: z.string().max(120).optional(),
    context: z.string().max(3_000).optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const originError = assertCreatorMutationOrigin(request);
    if (originError) return originError;

    const access = await requireCreatorAccess(request);
    if (isCreatorAccessDenied(access)) return access;

    const rate = await consumeRateLimit({
      policy: { id: "creator-autocomplete", windowMs: 60_000, max: 30 },
      key: buildRateLimitKey({
        request,
        userId: access.userId,
        routeId: "api-creator-autocomplete",
      }),
    });
    if (!rate.allowed) return rateLimitExceededResponse(rate, request);

    const { settings, schemaAvailable } = await getCreatorSettings(access.userId);
    if (!schemaAvailable) {
      return internalErrorResponse({ request, error: new CreatorStudioSchemaUnavailableError() });
    }
    if (!settings.autocompleteEnabled) {
      return apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "Autocomplete is disabled in Creator Settings.",
      });
    }

    const parsed = autocompleteBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid autocomplete payload.",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    const context = (body.context ?? "").slice(-2_000);

    // Fetch last 3 accepted autocomplete completions for per-user style tailoring
    const recentMemory = await listCreatorMemory({
      userId: access.userId,
      workflowId: "autocomplete",
      limit: 6,
    });
    const styleExamples = recentMemory
      .filter((m) => m.role === "assistant" && m.content.trim().length > 0)
      .slice(0, 3)
      .map((m) => `"${m.content.trim().slice(0, 120)}"`)
      .join("\n");

    const prompt = [
      "Complete the user's draft with at most 25 words.",
      "Keep the same tone and avoid introducing new facts.",
      settings.autocompletePrompt ? `Policy: ${settings.autocompletePrompt}` : "",
      body.articleType ? `Article type: ${body.articleType}` : "",
      body.headline ? `Headline: ${body.headline}` : "",
      styleExamples ? `Writing style examples from this author:\n${styleExamples}` : "",
      `Draft tail:\n${context}`,
      "Return only the completion text.",
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await generateCreatorText({
      userId: access.userId,
      workflowId: "autocomplete",
      callKind: "creator_autocomplete",
      route: "app/api/creator/autocomplete",
      prompt,
      maxTokens: 40,
      temperature: 0.2,
    });
    await createCreatorMemorySession({
      userId: access.userId,
      workflowId: "autocomplete",
      role: "assistant",
      content: completion.text.slice(0, 800),
      retentionDays: settings.memoryRetentionDays,
    });
    return NextResponse.json({
      suggestion: completion.text.trim(),
      provider: completion.provider,
      model: completion.model,
    });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
