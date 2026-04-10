import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().optional()
);

const optionalBooleanString = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}, z.boolean().optional());

const optionalNumberString = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: optionalTrimmedString,
  AUTH_DISABLED: optionalBooleanString,
  NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN: optionalTrimmedString,
  NEXT_PUBLIC_SITE_URL: optionalTrimmedString,
  NEXT_PUBLIC_SUPPORT_EMAIL: optionalTrimmedString,
  NEXT_PUBLIC_LEGAL_LAST_UPDATED: optionalTrimmedString,
  ANTHROPIC_API_KEY: optionalTrimmedString,
  ANTHROPIC_CROSSWORD_MODEL: optionalTrimmedString,
  SENTRY_DSN: optionalTrimmedString,
  SENTRY_ENVIRONMENT: optionalTrimmedString,
  SENTRY_RELEASE: optionalTrimmedString,
  DATADOG_API_KEY: optionalTrimmedString,
  DATADOG_SITE: optionalTrimmedString,
  DATADOG_SERVICE: optionalTrimmedString,
  INGEST_OVERHAUL_ENABLED: optionalBooleanString,
  INGEST_OVERHAUL_CANARY_CATEGORIES: optionalTrimmedString,
  INGEST_SOFT_DEADLINE_MS: optionalNumberString,
  INGEST_RUN_INPUT_TOKEN_CAP: optionalNumberString,
  INGEST_RUN_OUTPUT_TOKEN_CAP: optionalNumberString,
  /** Use Anthropic Message Batches API for overhaul expansion (~50% lower token cost; async, minutes–hours). */
  INGEST_MESSAGE_BATCH: optionalBooleanString,
  /** Max time to poll for batch completion (default 1h). */
  INGEST_BATCH_MAX_WAIT_MS: optionalNumberString,
  INGEST_BATCH_POLL_MS: optionalNumberString,
  INGEST_BATCH_SYNC_FALLBACK_LIMIT: optionalNumberString,
  INGEST_AUTO_LOCALE: optionalTrimmedString,
  INGEST_DISCOVERY_PROVIDER: optionalTrimmedString,
  /** Rewrite discovered stories with LLM expansion. Defaults false when unset. */
  INGEST_REWRITE_ENABLED: optionalBooleanString,
  INGEST_STALENESS_HOURS: optionalNumberString,
  INGEST_STALENESS_REFILL_COUNT: optionalNumberString,
  RSS_FEED_AUTO_DISABLE_FAILURES: optionalNumberString,
  RSS_DISCOVERY_MAX_FEEDS: optionalNumberString,
  RSS_DISCOVERY_FEED_POOL_LIMIT: optionalNumberString,
  RSS_DISCOVERY_ITEMS_PER_FEED: optionalNumberString,
  RSS_DISCOVERY_ITEMS_PER_FEED_MAX: optionalNumberString,
  FEED_SEEN_TABLE_READS_ENABLED: optionalBooleanString,
  FEED_INCLUDE_USER_SUBMITTED: optionalBooleanString,
  TURNSTILE_ENABLED: optionalBooleanString,
  NEXT_PUBLIC_TURNSTILE_ENABLED: optionalBooleanString,
  TURNSTILE_SECRET_KEY: optionalTrimmedString,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalTrimmedString,
  OPENWEATHER_API_KEY: optionalTrimmedString,
  GOOGLE_MAPS_SERVER_API_KEY: optionalTrimmedString,
  NEXT_PUBLIC_GOOGLE_PLACES_API_KEY: optionalTrimmedString,
  NEXT_PUBLIC_GOOGLE_PLACES_AUTOFILL_ENABLED: optionalBooleanString,
  NEXT_PUBLIC_FEED_FILLER_FALLBACK: optionalTrimmedString,
  NEXT_PUBLIC_ENGAGEMENT_SCROLL_DEPTH_ENABLED: optionalBooleanString,
  /** Max age (hours) of newest article `fetched_at` before engagement-health alerts (catalog ingest freshness). Default 336 (14d) if unset. */
  ENGAGEMENT_HEALTH_MAX_FRESHNESS_HOURS: optionalNumberString,
  SPOTIFY_CLIENT_ID: optionalTrimmedString,
  SPOTIFY_CLIENT_SECRET: optionalTrimmedString,
  SPOTIFY_MODULE_ENABLED: optionalBooleanString,
  NEXT_PUBLIC_SPOTIFY_MODULE_ENABLED: optionalBooleanString,
  SPOTIFY_MODULE_MARKET: optionalTrimmedString,
  SPOTIFY_MODULE_DEFAULT_MOODS: optionalTrimmedString,
  RECIPE_IMPORT_ALLOWLIST: optionalTrimmedString,
  RECIPE_IMPORT_ENABLE_CLAUDE_FALLBACK: optionalBooleanString,
  CRON_GAMES_LLM_ENABLED: optionalBooleanString,
  RATE_LIMIT_DISABLED: optionalBooleanString,
  RATE_LIMIT_USE_MEMORY: optionalBooleanString,
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): Env {
  return envSchema.parse(input);
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) cachedEnv = parseEnv(process.env);
  return cachedEnv;
}
