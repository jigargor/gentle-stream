import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const body = parsed.data;
    const mode = body.mode ?? "improve";
    const contentKind = body.contentKind ?? "user_article";
    const headline = (body.headline ?? "").trim();
    const draftBody = (body.body ?? "").trim();
    if (headline.length === 0 && mode === "headline") {
      return NextResponse.json({ error: "Provide a headline to refine." }, { status: 400 });
    }
    if (draftBody.length < 40) {
      return NextResponse.json(
        { error: "Add at least a short draft before using AI assist." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI assist is not configured on the server." },
        { status: 503 }
      );
    }

    const prompt = buildPrompt({
      mode,
      contentKind,
      headline,
      body: draftBody,
    });

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 300,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      content?: Array<{ type?: string; text?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      return NextResponse.json(
        { error: payload.error?.message ?? "AI assist failed." },
        { status: response.status }
      );
    }

    const text =
      payload.content?.find((entry) => entry.type === "text")?.text?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ error: "No assist output returned." }, { status: 502 });
    }
    return NextResponse.json({ result: text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
