import { createRequire } from "node:module";

// Intentionally no `server-only` import: that package throws when loaded under plain
// Node (e.g. `tsx` scripts in CI). Client bundles must not import this file; use
// `@/lib/observability/client` in client components.

export interface SentryLike {
  captureException: (error: unknown, extra?: Record<string, unknown>) => void;
  captureMessage: (
    message: string,
    options?: { level?: "error" | "warning" | "info"; extra?: Record<string, unknown> }
  ) => void;
}

let cachedSentry: SentryLike | null = null;
let sentryResolved = false;
const requireFromHere = createRequire(import.meta.url);

export function resolveSentry(): SentryLike | null {
  if (sentryResolved) return cachedSentry;
  sentryResolved = true;
  // Keep Sentry optional to avoid runtime hard-fail when not installed/configured.
  try {
    const mod = requireFromHere("@sentry/nextjs") as Partial<SentryLike>;
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
