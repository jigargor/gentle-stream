import { type NextRequest } from "next/server";
import { getOrCreateTraceId } from "@/lib/api/errors";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const traceId = getOrCreateTraceId(request);
  const nonce = crypto.randomUUID();
  const response = await updateSession(request, traceId);
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
