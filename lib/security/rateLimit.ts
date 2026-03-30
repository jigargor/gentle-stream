import { NextResponse } from "next/server";

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

const RATE_LIMIT_DISABLED =
  process.env.RATE_LIMIT_DISABLED === "1" ||
  process.env.RATE_LIMIT_DISABLED === "true";

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
  const xff = request.headers.get("x-forwarded-for")?.trim() ?? "";
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
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

export function consumeRateLimit(options: RateLimitOptions): RateLimitResult {
  if (RATE_LIMIT_DISABLED) {
    return {
      allowed: true,
      remaining: options.policy.max,
      retryAfterSec: 0,
      resetAt: nowMs() + options.policy.windowMs,
    };
  }

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

export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  const response = NextResponse.json(
    { error: "Too many requests. Please retry shortly." },
    { status: 429 }
  );
  response.headers.set("Retry-After", String(result.retryAfterSec));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(result.resetAt));
  return response;
}
