import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // All DB tests share one database, so files must not run in parallel.
    fileParallelism: false,
    globalSetup: ["./tests/helpers/globalSetup.ts"],
  },
});
