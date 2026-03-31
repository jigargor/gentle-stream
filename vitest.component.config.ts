import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/components/**/*.test.tsx"],
      exclude: ["tests/unit/**", "tests/integration/**", "tests/routes/**"],
      environment: "jsdom",
      setupFiles: ["tests/setup.ts"],
    },
  })
);
