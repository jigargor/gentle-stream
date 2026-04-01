import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

afterEach(() => {
  cleanup();
  // Keep tests isolated from mutated env state.
  const mutableEnv = process.env as Record<string, string | undefined>;
  delete mutableEnv.AUTH_DISABLED;
  delete mutableEnv.NODE_ENV;
});
