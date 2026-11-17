import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// happy-dom gives the tests a fake browser; the alias mirrors "@/*" from tsconfig.json.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  // Tests do not need Tailwind: an empty PostCSS list stops Vite loading postcss.config.mjs for CSS imports.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
