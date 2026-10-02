import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    sequence: { concurrent: false }
  }
});
