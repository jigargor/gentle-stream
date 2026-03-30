/**
 * Anthropic Message Batches API — ~50% lower token pricing vs synchronous Messages API.
 * @see https://docs.anthropic.com/en/docs/build-with-claude/message-batches
 */

const BATCHES_BASE = "https://api.anthropic.com/v1/messages/batches";

export const CLAUDE_WEB_SEARCH_MODEL = "claude-sonnet-4-20250514";
export const ANTHROPIC_WEB_SEARCH_BETA = "web-search-2025-03-05";

/** Same shape as POST /v1/messages body (used as `params` per batch request). */
export function buildClaudeWebSearchMessageParams(input: {
  prompt: string;
  maxTokens: number;
}): Record<string, unknown> {
  return {
    model: CLAUDE_WEB_SEARCH_MODEL,
    max_tokens: input.maxTokens,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: input.prompt }],
  };
}

function anthropicHeaders(apiKey: string, extra?: Record<string, string>): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    ...extra,
  };
}

export async function createMessageBatch(
  apiKey: string,
  requests: { custom_id: string; params: Record<string, unknown> }[]
): Promise<{ id: string }> {
  const res = await fetch(BATCHES_BASE, {
    method: "POST",
    headers: anthropicHeaders(apiKey, { "anthropic-beta": ANTHROPIC_WEB_SEARCH_BETA }),
    body: JSON.stringify({ requests }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Message batch create ${res.status}: ${text.slice(0, 800)}`);
  }
  const data = JSON.parse(text) as { id?: string };
  if (!data.id) throw new Error("Message batch create: missing id");
  return { id: data.id };
}

export interface MessageBatchStatus {
  id: string;
  processing_status: "in_progress" | "canceling" | "ended";
  results_url?: string;
}

export async function retrieveMessageBatch(
  apiKey: string,
  batchId: string
): Promise<MessageBatchStatus> {
  const res = await fetch(`${BATCHES_BASE}/${encodeURIComponent(batchId)}`, {
    headers: anthropicHeaders(apiKey),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Message batch get ${res.status}: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text) as MessageBatchStatus;
}

export async function pollMessageBatchUntilEnded(
  apiKey: string,
  batchId: string,
  options: { maxWaitMs: number; pollIntervalMs: number }
): Promise<void> {
  const deadline = Date.now() + options.maxWaitMs;
  while (Date.now() < deadline) {
    const batch = await retrieveMessageBatch(apiKey, batchId);
    if (batch.processing_status === "ended") return;
    if (batch.processing_status === "canceling") {
      throw new Error("Message batch is canceling");
    }
    await new Promise((r) => setTimeout(r, options.pollIntervalMs));
  }
  throw new Error("Message batch poll timeout");
}

/** Fetch JSONL via authenticated results endpoint (same content as `results_url`). */
export async function fetchMessageBatchResultsJsonl(
  apiKey: string,
  batchId: string
): Promise<string[]> {
  const res = await fetch(
    `${BATCHES_BASE}/${encodeURIComponent(batchId)}/results`,
    {
      headers: anthropicHeaders(apiKey),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Message batch results ${res.status}: ${text.slice(0, 800)}`);
  }
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

export interface ParsedBatchLine {
  custom_id: string;
  succeeded: boolean;
  /** Full Message object when succeeded (same as sync Messages API `message`). */
  message?: Record<string, unknown>;
  errorText?: string;
}

export function parseMessageBatchJsonlLine(line: string): ParsedBatchLine | null {
  try {
    const row = JSON.parse(line) as {
      custom_id?: string;
      result?: {
        type?: string;
        message?: Record<string, unknown>;
        error?: { message?: string; type?: string };
      };
    };
    if (typeof row.custom_id !== "string" || !row.result) return null;
    const t = row.result.type;
    if (t === "succeeded" && row.result.message) {
      return {
        custom_id: row.custom_id,
        succeeded: true,
        message: row.result.message,
      };
    }
    if (t === "errored") {
      const msg =
        row.result.error?.message ??
        row.result.error?.type ??
        "batch request errored";
      return { custom_id: row.custom_id, succeeded: false, errorText: msg };
    }
    return {
      custom_id: row.custom_id,
      succeeded: false,
      errorText: t ?? "unknown_batch_result",
    };
  } catch {
    return null;
  }
}
