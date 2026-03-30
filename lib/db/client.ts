import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

const env = getEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars."
  );
}

/**
 * Server-side Supabase client using the service role key.
 * Never expose this client to the browser.
 */
export const db = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});
