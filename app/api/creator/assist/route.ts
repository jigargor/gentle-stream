import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { API_ERROR_CODES, apiErrorResponse, internalErrorResponse } from "@/lib/api/errors";
import { generateLlmText, LlmProviderError } from "@/lib/llm/client";

const assistBodySchema = z
  .object({
    mode: z.enum(["improve", "continue", "headline"]).optional(),
    contentKind: z.enum(["user_article", "recipe"]).optional(),
    headline: z.string().max(280).optional(),
    body: z.string().max(18_000).optional(),
  })
  .strict();

type AssistRequestBody = z.infer<typeof assistBodySchema>;

function buildPrompt(input: Required<AssistRequestBody>): string {
  const styleGuide =
    "Keep tone uplifting, practical, and concise. Never invent facts. Keep output plain text without markdown code fences.";
  if (input.mode === "headline") {
    return `${styleGuide}
Task: suggest one better headline for this ${input.contentKind}.
Current headline: ${input.headline}
Body excerpt:
${input.body.slice(0, 1200)}
Return only the revised headline.`;
  }
  if (input.mode === "continue") {
    return `${styleGuide}
Task: continue this ${input.contentKind} draft with one short paragraph (max 80 words), matching voice.
Headline: ${input.headline}
Draft:
${input.body.slice(0, 1800)}
Return only the continuation paragraph.`;
  }
  return `${styleGuide}
Task: improve this ${input.contentKind} draft paragraph for clarity and flow.
Headline: ${input.headline}
Draft:
${input.body.slice(0, 1800)}
Return only the improved text.`;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return apiErrorResponse({
        request,
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: "Unauthorized",
      });
    }
    const rateLimit = await consumeRateLimit({
      policy: { id: "creator-assist", windowMs: 60_000, max: 20 },
      key: buildRateLimitKey({
        request,
        userId,
        routeId: "api-creator-assist",
      }),
    });
    if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

    const parsed = assistBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Invalid request body.",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;
    const mode = body.mode ?? "improve";
    const contentKind = body.contentKind ?? "user_article";
    const headline = (body.headline ?? "").trim();
    const draftBody = (body.body ?? "").trim();
    if (headline.length === 0 && mode === "headline") {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.MISSING_FIELD,
        message: "Provide a headline to refine.",
      });
    }
    if (draftBody.length < 40) {
      return apiErrorResponse({
        request,
        status: 400,
        code: API_ERROR_CODES.VALIDATION,
        message: "Add at least a short draft before using AI assist.",
      });
    }

    const prompt = buildPrompt({
      mode,
      contentKind,
      headline,
      body: draftBody,
    });

    let text = "";
    try {
      const completion = await generateLlmText({
        callKind: "creator_assist",
        route: "app/api/creator/assist",
        agent: "creator_assist",
        correlationId: userId,
        prompt,
        maxTokens: 300,
        temperature: 0.4,
      });
      text = completion.text.trim();
    } catch (error: unknown) {
      if (!(error instanceof LlmProviderError)) throw error;
      return apiErrorResponse({
        request,
        status: 502,
        code: API_ERROR_CODES.BAD_GATEWAY,
        message: "AI assist failed.",
      });
    }
    if (!text) {
      return apiErrorResponse({
        request,
        status: 502,
        code: API_ERROR_CODES.BAD_GATEWAY,
        message: "No assist output returned.",
      });
    }
    return NextResponse.json({ result: text });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
