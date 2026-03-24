/**
 * Check that NEXT_PUBLIC_SUPABASE_ANON_KEY is safe for the browser (same rules as the app).
 *
 *   npx tsx scripts/validate-supabase-public-key.ts
 */

import { config } from "dotenv";
import {
  rejectIfSupabaseKeyIsPlatformSecret,
  rejectIfSupabaseKeyIsServiceRole,
} from "../lib/supabase/validate-anon-key";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (expected in .env.local)."
  );
  process.exit(1);
}

try {
  rejectIfSupabaseKeyIsPlatformSecret(key);
  rejectIfSupabaseKeyIsServiceRole(key);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log("OK — public Supabase key passes browser checks.");
if (key.startsWith("sb_publishable_")) {
  console.log("  (publishable key)");
} else if (key.startsWith("eyJ")) {
  console.log("  (legacy JWT — ensure role is anon, not service_role)");
}
