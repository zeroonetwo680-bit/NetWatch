import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // "server-only" is a bundler-only guard: in Node it throws by design.
      // Tests import server modules directly, so stub it out.
      "server-only": path.resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
