import { db } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

interface RateLimitPolicy {
  id: string;
  windowMs: number;
  max: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  policy: RateLimitPolicy;
  key: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
}

const env = getEnv();
const RATE_LIMIT_DISABLED = env.RATE_LIMIT_DISABLED === true;
const RATE_LIMIT_USE_MEMORY = env.RATE_LIMIT_USE_MEMORY === true;

function getStore(): Map<string, RateLimitRecord> {
  const g = globalThis as typeof globalThis & {
    __gentleStreamRateLimitStore?: Map<string, RateLimitRecord>;
  };
  if (!g.__gentleStreamRateLimitStore) {
    g.__gentleStreamRateLimitStore = new Map<string, RateLimitRecord>();
  }
  return g.__gentleStreamRateLimitStore;
}

function nowMs(): number {
  return Date.now();
}

export function getClientIp(request: Request): string {
  // Prefer Vercel's trusted header (not user-controllable)
  const vercelIp = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelIp) return vercelIp.split(",")[0]?.trim() || vercelIp;

  // Use LAST IP in x-forwarded-for (set by ingress proxy, not client)
  const xff = request.headers.get("x-forwarded-for")?.trim() ?? "";
  if (xff) {
    const parts = xff.split(",").map((p: string) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function buildRateLimitKey(params: {
  request: Request;
  userId?: string | null;
  routeId: string;
}): string {
  const byUser = params.userId?.trim();
  if (byUser) return `${params.routeId}:u:${byUser}`;
  return `${params.routeId}:ip:${getClientIp(params.request)}`;
}

function consumeRateLimitInMemory(options: RateLimitOptions): RateLimitResult {
  const store = getStore();
  const key = `${options.policy.id}:${options.key}`;
  const now = nowMs();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.policy.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, options.policy.max - 1),
      retryAfterSec: Math.ceil(options.policy.windowMs / 1000),
      resetAt: now + options.policy.windowMs,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  const remaining = Math.max(0, options.policy.max - existing.count);
  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: existing.count <= options.policy.max,
    remaining,
    retryAfterSec,
    resetAt: existing.resetAt,
  };
}

interface ConsumeRateLimitRpcRow {
  allowed: boolean;
  remaining: number;
  retry_after_sec: number;
  reset_at: string;
}

export async function consumeRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  if (RATE_LIMIT_DISABLED) {
    return {
      allowed: true,
      remaining: options.policy.max,
      retryAfterSec: 0,
      resetAt: nowMs() + options.policy.windowMs,
    };
  }
  if (RATE_LIMIT_USE_MEMORY) return consumeRateLimitInMemory(options);

  try {
    const { data, error } = await db.rpc("consume_rate_limit", {
      p_policy_id: options.policy.id,
      p_bucket_key: options.key,
      p_window_ms: options.policy.windowMs,
      p_max: options.policy.max,
    });
    if (error || !Array.isArray(data) || data.length === 0) {
      console.warn(
        "[rate-limit] Supabase RPC failed — falling back to in-memory store. Rate limiting may be ineffective in multi-instance deployments."
      );
      return consumeRateLimitInMemory(options);
    }
    const row = data[0] as ConsumeRateLimitRpcRow;
    return {
      allowed: row.allowed === true,
      remaining: Math.max(0, Number(row.remaining ?? 0)),
      retryAfterSec: Math.max(1, Number(row.retry_after_sec ?? 1)),
      resetAt: Date.parse(row.reset_at),
    };
  } catch {
    console.warn(
      "[rate-limit] Supabase RPC failed — falling back to in-memory store. Rate limiting may be ineffective in multi-instance deployments."
    );
    return consumeRateLimitInMemory(options);
  }
}

export function rateLimitExceededResponse(
  result: RateLimitResult,
  request?: Request
) {
  return apiErrorResponse({
    request,
    status: 429,
    code: API_ERROR_CODES.RATE_LIMITED,
    message: "Too many requests. Please retry shortly.",
    retryAfterSec: result.retryAfterSec,
    headers: {
      "Retry-After": String(result.retryAfterSec),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(result.resetAt),
    },
  });
}
