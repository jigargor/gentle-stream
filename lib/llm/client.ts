import { getEnv } from "@/lib/env";
import { logLlmProviderCall } from "@/lib/db/llmProviderCalls";

export type LlmProvider = "anthropic" | "openai" | "gemini";

export interface LlmGenerateTextInput {
  provider?: LlmProvider;
  model?: string;
  callKind: string;
  route: string;
  agent?: string;
  category?: string;
  correlationId?: string;
  ingestRunId?: string;
  systemPrompt?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmGenerateTextResult {
  provider: LlmProvider;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class LlmProviderError extends Error {
  provider: LlmProvider;
  model: string;
  status: number | null;
  responseBody: string;

  constructor(input: {
    provider: LlmProvider;
    model: string;
    status: number | null;
    responseBody: string;
    message: string;
  }) {
    super(input.message);
    this.provider = input.provider;
    this.model = input.model;
    this.status = input.status;
    this.responseBody = input.responseBody;
  }
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
};

/** Primary → fallback order for `generateLlmText` when `provider` is omitted. */
const PROVIDER_FALLBACK_CHAIN: LlmProvider[] = ["anthropic", "openai", "gemini"];

function hasProviderApiKey(provider: LlmProvider): boolean {
  const env = getEnv();
  if (provider === "anthropic") return Boolean(env.ANTHROPIC_API_KEY?.trim());
  if (provider === "openai") return Boolean(env.OPENAI_API_KEY?.trim());
  return Boolean(env.GEMINI_API_KEY?.trim());
}

function resolveModel(provider: LlmProvider, override?: string): string {
  if (override?.trim()) return override.trim();
  const env = getEnv();
  if (provider === "anthropic") return env.ANTHROPIC_DEFAULT_MODEL ?? DEFAULT_MODELS.anthropic;
  if (provider === "openai") return env.OPENAI_DEFAULT_MODEL ?? DEFAULT_MODELS.openai;
  return env.GEMINI_DEFAULT_MODEL ?? DEFAULT_MODELS.gemini;
}

async function logFailure(
  input: LlmGenerateTextInput,
  provider: LlmProvider,
  model: string,
  startedAt: number,
  status: number | null,
  responseBody: string
): Promise<void> {
  await logLlmProviderCall({
    provider,
    callKind: input.callKind,
    route: input.route,
    agent: input.agent ?? null,
    category: input.category ?? null,
    model,
    durationMs: Date.now() - startedAt,
    httpStatus: status,
    success: false,
    errorCode: status != null ? `http_${status}` : "request_failed",
    errorMessage: responseBody.slice(0, 500),
    correlationId: input.correlationId ?? null,
    ingestRunId: input.ingestRunId ?? null,
  });
}

async function logSuccess(
  input: LlmGenerateTextInput,
  provider: LlmProvider,
  model: string,
  startedAt: number,
  status: number | null,
  usage: { inputTokens: number; outputTokens: number }
): Promise<void> {
  await logLlmProviderCall({
    provider,
    callKind: input.callKind,
    route: input.route,
    agent: input.agent ?? null,
    category: input.category ?? null,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationMs: Date.now() - startedAt,
    httpStatus: status,
    success: true,
    correlationId: input.correlationId ?? null,
    ingestRunId: input.ingestRunId ?? null,
  });
}

async function runAnthropic(input: LlmGenerateTextInput): Promise<LlmGenerateTextResult> {
  const apiKey = getEnv().ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = resolveModel("anthropic", input.model);
  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 300,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      messages: [{ role: "user", content: input.prompt }],
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    await logFailure(input, "anthropic", model, startedAt, response.status, responseText);
    throw new LlmProviderError({
      provider: "anthropic",
      model,
      status: response.status,
      responseBody: responseText,
      message: "Anthropic request failed",
    });
  }
  const payload = JSON.parse(responseText) as {
    usage?: { input_tokens?: number; output_tokens?: number };
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = payload.content?.find((entry) => entry.type === "text")?.text?.trim() ?? "";
  const usage = {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
  };
  await logSuccess(input, "anthropic", model, startedAt, response.status, usage);
  return {
    provider: "anthropic",
    model,
    text,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

async function runOpenAi(input: LlmGenerateTextInput): Promise<LlmGenerateTextResult> {
  const apiKey = getEnv().OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = resolveModel("openai", input.model);
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature ?? 0.4,
      max_tokens: input.maxTokens ?? 300,
      messages: [
        ...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []),
        { role: "user", content: input.prompt },
      ],
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    await logFailure(input, "openai", model, startedAt, response.status, responseText);
    throw new LlmProviderError({
      provider: "openai",
      model,
      status: response.status,
      responseBody: responseText,
      message: "OpenAI request failed",
    });
  }
  const payload = JSON.parse(responseText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  const usage = {
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
  };
  await logSuccess(input, "openai", model, startedAt, response.status, usage);
  return {
    provider: "openai",
    model,
    text,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

async function runGemini(input: LlmGenerateTextInput): Promise<LlmGenerateTextResult> {
  const apiKey = getEnv().GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = resolveModel("gemini", input.model);
  const startedAt = Date.now();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(input.systemPrompt
          ? { systemInstruction: { parts: [{ text: input.systemPrompt }] } }
          : {}),
        generationConfig: {
          temperature: input.temperature ?? 0.4,
          maxOutputTokens: input.maxTokens ?? 300,
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.prompt }],
          },
        ],
      }),
    }
  );
  const responseText = await response.text();
  if (!response.ok) {
    await logFailure(input, "gemini", model, startedAt, response.status, responseText);
    throw new LlmProviderError({
      provider: "gemini",
      model,
      status: response.status,
      responseBody: responseText,
      message: "Gemini request failed",
    });
  }
  const payload = JSON.parse(responseText) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";
  const usage = {
    inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
  };
  await logSuccess(input, "gemini", model, startedAt, response.status, usage);
  return {
    provider: "gemini",
    model,
    text,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

async function runProvider(
  input: LlmGenerateTextInput,
  provider: LlmProvider
): Promise<LlmGenerateTextResult> {
  if (provider === "anthropic") return runAnthropic(input);
  if (provider === "openai") return runOpenAi(input);
  return runGemini(input);
}

export async function generateLlmText(input: LlmGenerateTextInput): Promise<LlmGenerateTextResult> {
  if (input.provider) {
    if (!hasProviderApiKey(input.provider)) {
      throw new Error(`${input.provider} was requested but its API key is not set`);
    }
    return runProvider(input, input.provider);
  }

  const errors: LlmProviderError[] = [];
  for (const provider of PROVIDER_FALLBACK_CHAIN) {
    if (!hasProviderApiKey(provider)) continue;
    try {
      return await runProvider(input, provider);
    } catch (error) {
      if (error instanceof LlmProviderError) {
        errors.push(error);
        continue;
      }
      throw error;
    }
  }

  if (errors.length > 0) throw errors[errors.length - 1]!;
  throw new Error(
    "No LLM provider available: set ANTHROPIC_API_KEY and/or OPENAI_API_KEY and/or GEMINI_API_KEY"
  );
}
