import { db } from "@/lib/db/client";
import { captureException, captureMessage } from "@/lib/observability";

export interface LlmProviderCallInput {
  provider: string;
  callKind: string;
  userId?: string | null;
  workflowId?: string | null;
  route?: string | null;
  agent?: string | null;
  category?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  durationMs?: number | null;
  httpStatus?: number | null;
  success: boolean;
  status?: string | null;
  retryCount?: number | null;
  fallbackReason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  correlationId?: string | null;
  ingestRunId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

function toMetadataJson(
  value: LlmProviderCallInput["metadata"]
): Record<string, string | number | boolean | null> {
  if (!value) return {};
  return value;
}

export async function logLlmProviderCall(input: LlmProviderCallInput): Promise<void> {
  const payload = {
    provider: input.provider,
    call_kind: input.callKind,
    user_id: input.userId ?? null,
    workflow_id: input.workflowId ?? null,
    route: input.route ?? null,
    agent: input.agent ?? null,
    category: input.category ?? null,
    model: input.model ?? null,
    input_tokens: input.inputTokens ?? 0,
    output_tokens: input.outputTokens ?? 0,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    duration_ms: input.durationMs ?? null,
    http_status: input.httpStatus ?? null,
    success: input.success,
    status: input.status ?? (input.success ? "success" : "error"),
    retry_count: input.retryCount ?? 0,
    fallback_reason: input.fallbackReason ?? null,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    correlation_id: input.correlationId ?? null,
    ingest_run_id: input.ingestRunId ?? null,
    metadata: toMetadataJson(input.metadata),
  };

  try {
    const { error } = await db.from("llm_provider_calls").insert(payload);
    if (error) throw new Error(error.message);
  } catch (error) {
    captureException(error, {
      dbTable: "llm_provider_calls",
      provider: input.provider,
      callKind: input.callKind,
      route: input.route ?? undefined,
      agent: input.agent ?? undefined,
    });
  }

  captureMessage({
    level: input.success ? "info" : "warning",
    message: "llm.provider.call",
    context: {
      provider: input.provider,
      callKind: input.callKind,
      userId: input.userId ?? undefined,
      workflowId: input.workflowId ?? undefined,
      route: input.route ?? undefined,
      agent: input.agent ?? undefined,
      category: input.category ?? undefined,
      model: input.model ?? undefined,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      estimatedCostUsd: input.estimatedCostUsd ?? undefined,
      durationMs: input.durationMs ?? undefined,
      httpStatus: input.httpStatus ?? undefined,
      success: input.success,
      status: input.status ?? undefined,
      retryCount: input.retryCount ?? undefined,
      fallbackReason: input.fallbackReason ?? undefined,
      errorCode: input.errorCode ?? undefined,
      correlationId: input.correlationId ?? undefined,
    },
  });
}
