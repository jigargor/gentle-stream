import { NextRequest, NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  buildRateLimitKey,
  consumeRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { hasTrustedOrigin } from "@/lib/security/origin";

interface EmailLinkBody {
  email?: unknown;
  redirectTo?: unknown;
  turnstileToken?: unknown;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function allowedAuthOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // ignore malformed request URL
  }

  const envOrigin = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim();
  if (envOrigin) {
    try {
      origins.add(new URL(envOrigin).origin);
    } catch {
      // ignore malformed env value
    }
  }
  return origins;
}

function isAllowedRedirectTo(request: NextRequest, redirectTo: string): boolean {
  try {
    const parsed = new URL(redirectTo);
    return allowedAuthOrigins(request).has(parsed.origin);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const ipLimit = consumeRateLimit({
    policy: { id: "auth-email-link-ip", windowMs: 10 * 60 * 1000, max: 16 },
    key: buildRateLimitKey({ request, routeId: "auth-email-link" }),
  });
  if (!ipLimit.allowed) return rateLimitExceededResponse(ipLimit);

  let body: EmailLinkBody;
  try {
    body = (await request.json()) as EmailLinkBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const redirectTo = typeof body.redirectTo === "string" ? body.redirectTo.trim() : "";
  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (!redirectTo || !isAllowedRedirectTo(request, redirectTo)) {
    return NextResponse.json({ error: "Invalid auth redirect URL." }, { status: 400 });
  }

  const emailLimit = consumeRateLimit({
    policy: { id: "auth-email-link-email", windowMs: 10 * 60 * 1000, max: 6 },
    key: `email:${email}`,
  });
  if (!emailLimit.allowed) return rateLimitExceededResponse(emailLimit);

  const captcha = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: getClientIp(request),
  });
  if (!captcha.success) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const supabase = createPublicServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not send sign-in link right now." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
