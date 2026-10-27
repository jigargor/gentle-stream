import { defineConfig, devices } from "@playwright/test";

const isCi = process.env.CI === "true";
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const useMockServer = process.env.PLAYWRIGHT_USE_MOCK_SERVER === "1";

const devServerEnv = {
  DEV_LIGHT: "1",
  E2E_HARNESS: process.env.E2E_HARNESS ?? "",
  TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED ?? "0",
  NEXT_PUBLIC_TURNSTILE_ENABLED: process.env.NEXT_PUBLIC_TURNSTILE_ENABLED ?? "0",
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  timeout: isCi ? 90_000 : 30_000,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: baseUrl,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: useMockServer
          ? "cross-env E2E_PORT=3000 node ./e2e-mocks/server.mjs"
          : "npm run dev-light -- --hostname 127.0.0.1 --port 3000",
        env: useMockServer ? undefined : devServerEnv,
        url: baseUrl,
        // Mock smoke tests expect static HTML from e2e-mocks, not a leftover `next dev` on :3000.
        reuseExistingServer: useMockServer ? false : true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
