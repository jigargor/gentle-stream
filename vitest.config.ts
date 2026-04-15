import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    setupFiles: ["tests/setup.ts"],
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});