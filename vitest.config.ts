import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    // Agent worktrees under .claude/ carry their own copies of these tests;
    // collecting them inflates local runs with stale duplicates.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
});
