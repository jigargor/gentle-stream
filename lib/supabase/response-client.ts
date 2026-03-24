import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import {
  rejectIfSupabaseKeyIsPlatformSecret,
  rejectIfSupabaseKeyIsServiceRole,
} from "./validate-anon-key";

/**
 * Supabase client for Route Handlers / middleware branches where session cookies must be
 * applied to a specific NextResponse (redirects). Using cookies() from next/headers in a
 * Route Handler often does not persist Set-Cookie on the returned redirect.
 */
export function createSupabaseResponseClient(
  request: NextRequest,
  response: NextResponse
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  rejectIfSupabaseKeyIsPlatformSecret(key);
  rejectIfSupabaseKeyIsServiceRole(key);

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
