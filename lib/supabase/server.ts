import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  rejectIfSupabaseKeyIsPlatformSecret,
  rejectIfSupabaseKeyIsServiceRole,
} from "./validate-anon-key";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  rejectIfSupabaseKeyIsPlatformSecret(key);
  rejectIfSupabaseKeyIsServiceRole(key);

  const cookieStore = cookies();

  return createServerClient(url, key, {
    cookies: {
      async getAll() {
        const store = await cookieStore;
        return store.getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const store = await cookieStore;
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options)
          );
        } catch {
          // Called from a Server Component without mutable cookies; middleware refreshes session.
        }
      },
    },
  });
}
