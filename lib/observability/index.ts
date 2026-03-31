interface ObservabilityContext {
  [key: string]: string | number | boolean | null | undefined;
}

interface Span {
  end(extra?: ObservabilityContext): void;
}

interface CaptureInput {
  message: string;
  level?: "error" | "warning" | "info";
  context?: ObservabilityContext;
  error?: unknown;
}

type SentryLike = {
  captureException: (error: unknown, extra?: Record<string, unknown>) => void;
  captureMessage: (
    message: string,
    options?: { level?: "error" | "warning" | "info"; extra?: Record<string, unknown> }
  ) => void;
};

let cachedSentry: SentryLike | null = null;
let sentryResolved = false;

function toSerializableContext(context: ObservabilityContext | undefined): Record<string, unknown> {
  if (!context) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function readTraceId(context: ObservabilityContext | undefined): string | null {
  const value = context?.traceId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveSentry(): SentryLike | null {
  if (sentryResolved) return cachedSentry;
  sentryResolved = true;
  // Keep Sentry optional to avoid runtime hard-fail when not installed/configured.
  try {
    const dynamicRequire = eval("require") as (id: string) => unknown;
    const mod = dynamicRequire("@sentry/nextjs") as Partial<SentryLike>;
    if (
      mod &&
      typeof mod.captureException === "function" &&
      typeof mod.captureMessage === "function"
    ) {
      cachedSentry = {
        captureException: mod.captureException.bind(mod),
        captureMessage: mod.captureMessage.bind(mod),
      };
    }
  } catch {
    cachedSentry = null;
  }
  return cachedSentry;
}

function emitDatadogLog(input: CaptureInput): void {
  const apiKey = process.env.DATADOG_API_KEY?.trim();
  if (!apiKey) return;
  const site = process.env.DATADOG_SITE?.trim() || "datadoghq.com";
  const service = process.env.DATADOG_SERVICE?.trim() || "gentle-stream";
  const endpoint = `https://http-intake.logs.${site}/api/v2/logs`;
  const payload = {
    ddsource: "nodejs",
    service,
    status: input.level ?? "error",
    message: input.message,
    context: toSerializableContext(input.context),
  };
  void fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": apiKey,
    },
    body: JSON.stringify([payload]),
  }).catch(() => {
    // best effort only
  });
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

