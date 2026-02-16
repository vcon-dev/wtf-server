import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load .env file for tests
  const env = loadEnv(mode, process.cwd(), "");

  return {
    test: {
      globals: true,
      environment: "node",
      include: ["tests/**/*.test.ts"],
      env,
      coverage: {
        provider: "v8",
        reporter: ["text", "json", "html"],
        include: ["src/**/*.ts"],
        exclude: ["src/index.ts"],
      },
      testTimeout: 10000,
      hookTimeout: 10000,
    },
  };
});
