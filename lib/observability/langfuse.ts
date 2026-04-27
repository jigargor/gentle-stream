import { Buffer } from "node:buffer";
import { getEnv } from "@/lib/env";
import { redactSecrets } from "@/lib/security/redaction";

export interface LangfuseGenerationInput {
  userId?: string | null;
  workflowId?: string | null;
  provider: string;
  model: string;
  status: "success" | "error";
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  prompt?: string | null;
  completion?: string | null;
}

function getLangfuseAuthHeader(): string | null {
  const env = getEnv();
  const pub = env.LANGFUSE_PUBLIC_KEY?.trim();
  const sec = env.LANGFUSE_SECRET_KEY?.trim();
  if (!pub || !sec) return null;
  return `Basic ${Buffer.from(`${pub}:${sec}`, "utf8").toString("base64")}`;
}

export async function captureLangfuseGeneration(input: LangfuseGenerationInput): Promise<void> {
  const auth = getLangfuseAuthHeader();
  if (!auth) return;
  const env = getEnv();
  const baseUrl = env.LANGFUSE_BASE_URL?.trim() || "https://cloud.langfuse.com";
  const body = {
    batch: [
      {
        id: crypto.randomUUID(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: crypto.randomUUID(),
          name: "creator_studio_generation",
          userId: input.userId ?? undefined,
          model: input.model,
          modelParameters: {
            provider: input.provider,
            workflowId: input.workflowId ?? undefined,
          },
          prompt: redactSecrets(input.prompt ?? ""),
          completion: redactSecrets(input.completion ?? ""),
          usage: {
            input: input.inputTokens ?? 0,
            output: input.outputTokens ?? 0,
          },
          metadata: {
            status: input.status,
            latencyMs: input.latencyMs ?? null,
          },
          level: input.status === "success" ? "DEFAULT" : "ERROR",
        },
      },
    ],
  };
  try {
    await fetch(`${baseUrl}/api/public/ingestion`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Avoid breaking request flow if external observability is unavailable.
  }
}
