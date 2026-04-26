#!/usr/bin/env node

import { spawn } from "node:child_process";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });

const mode = process.argv[2] ?? "fast";
const flags = new Set(process.argv.slice(3));
const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const npxCmd = isWindows ? "npx.cmd" : "npx";

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-role-key",
  CRON_SECRET: "placeholder-cron-secret",
  ANTHROPIC_API_KEY: "placeholder-anthropic-key",
};

const fastChecks = [
  npm("run", "env:check"),
  npm("run", "security:inventory"),
  npm("run", "security:rls-audit"),
  npm("run", "validation:route-json-casts"),
  npm("run", "lint"),
  { ...npm("run", "security:audit"), continueOnError: true },
  npx("tsc", "--noEmit"),
  npm("run", "build"),
  npx("tsx", "scripts/test-sudoku.ts"),
  npx("tsx", "scripts/test-word-search.ts"),
  npx("tsx", "scripts/test-killer-nonogram.ts"),
  npx("tsx", "scripts/test-citations.ts"),
  npx("tsx", "scripts/test-article-engagement-api.ts"),
  npx("tsx", "scripts/test-recommendation-ranking.ts"),
  npx("tsx", "scripts/test-engagement-guardrails.ts"),
  npm("run", "test:unit"),
  npx("vitest", "run", "-c", "vitest.unit.config.ts", "tests/unit/articleDedupKeys.test.ts"),
  npm("run", "test:component"),
  ...(flags.has("--install-playwright") ? [npx("playwright", "install", "chromium")] : []),
  npm("run", "test:stories"),
  npm("run", "test:e2e:smoke"),
  npm("run", "test:integration"),
];

const integrationChecks = [
  npx("tsx", "scripts/test-dedup.ts"),
  npx("tsx", "scripts/test-url-dedup.ts"),
  npx("tsx", "scripts/test-moderation-gating.ts"),
  npx("tsx", "scripts/test-article-engagement-db.ts"),
  npx("tsx", "scripts/test-recommendation-e2e.ts"),
];

const plans = {
  fast: fastChecks,
  integration: integrationChecks,
  all: [...fastChecks, ...integrationChecks],
};

if (!(mode in plans)) {
  console.error(`Unknown CI check mode: ${mode}`);
  console.error("Expected one of: fast, integration, all");
  process.exit(2);
}

for (const step of plans[mode]) {
  const code = await runStep(step);
  if (code !== 0 && !step.continueOnError) {
    process.exit(code);
  }
}

function npm(...args) {
  return { command: npmCmd, args };
}

function npx(...args) {
  return { command: npxCmd, args };
}

function runStep(step) {
  const rendered = [step.command, ...step.args].join(" ");
  console.log(`\n[ci:${mode}] ${rendered}`);
  return new Promise((resolve) => {
    const child = spawn(isWindows ? rendered : step.command, isWindows ? [] : step.args, {
      env: { ...baseEnv, ...process.env },
      shell: isWindows,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      const exitCode = code ?? 1;
      if (exitCode !== 0 && step.continueOnError) {
        console.warn(`[ci:${mode}] continuing after allowed failure: ${rendered}`);
        resolve(0);
        return;
      }
      resolve(exitCode);
    });
    child.on("error", (error) => {
      console.error(`[ci:${mode}] failed to start ${rendered}`);
      console.error(error);
      resolve(1);
    });
  });
}
