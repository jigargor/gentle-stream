import { resolveSentry } from "@/lib/observability/sentry-server";
import {
  emitDatadogLog,
  readTraceId,
  toSerializableContext,
  type CaptureInput,
  type ObservabilityContext,
} from "@/lib/observability/shared";

export type { ObservabilityContext, CaptureInput } from "@/lib/observability/shared";

interface Span {
  end(extra?: ObservabilityContext): void;
}

export function captureException(
  error: unknown,
  context?: ObservabilityContext
): void {
  const sentry = resolveSentry();
  if (sentry) {
    try {
      sentry.captureException(error, { extra: toSerializableContext(context) });
    } catch {
      // swallow telemetry issues
    }
  }

  emitDatadogLog({
    level: "error",
    message: error instanceof Error ? error.message : "Unknown error",
    context,
    error,
  });
}

export function captureMessage(input: CaptureInput): void {
  const sentry = resolveSentry();
  if (sentry) {
    try {
      sentry.captureMessage(input.message, {
        level: input.level ?? "info",
        extra: toSerializableContext(input.context),
      });
    } catch {
      // swallow telemetry issues
    }
  }
  emitDatadogLog(input);
}

export function startSpan(name: string, context?: ObservabilityContext): Span {
  const startedAt = Date.now();
  const traceId = readTraceId(context);
  captureMessage({
    level: "info",
    message: "span.start",
    context: { spanName: name, traceId, ...(context ?? {}) },
  });

  return {
    end(extra?: ObservabilityContext) {
      const durationMs = Date.now() - startedAt;
      captureMessage({
        level: "info",
        message: "span.end",
        context: {
          spanName: name,
          durationMs,
          traceId,
          ...(context ?? {}),
          ...(extra ?? {}),
        },
      });
    },
  };
}

export async function flushOnShutdown(): Promise<void> {
  // Placeholder for providers requiring explicit flush.
  await Promise.resolve();
}
