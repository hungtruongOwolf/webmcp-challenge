import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    // Agent worktrees under .claude carry their own node_modules and a second
    // React copy, so their test files fail with "invalid hook call" if scanned.
    exclude: [...configDefaults.exclude, "e2e/**", "**/.claude/**"],
  },
});
