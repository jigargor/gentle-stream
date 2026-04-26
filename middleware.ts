import { type NextRequest } from "next/server";
import { getOrCreateTraceId } from "@/lib/api/errors";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const traceId = getOrCreateTraceId(request);
  const nonce = crypto.randomUUID();
  const response = await updateSession(request, traceId, nonce);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let supabaseOrigin = "";
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  } catch {
    supabaseOrigin = "";
  }
  const cspDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""} https://challenges.cloudflare.com https://maps.googleapis.com https://maps.gstatic.com https://places.googleapis.com`,
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://maps.googleapis.com https://maps.gstatic.com`,
    "frame-src https://challenges.cloudflare.com",
    "report-uri /api/csp-report",
  ].join("; ");
  response.headers.set("Content-Security-Policy", cspDirectives);
  response.headers.set("x-nonce", nonce);
  response.headers.set("X-Trace-Id", traceId);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
