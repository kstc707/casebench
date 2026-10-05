import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    // Database tests share one Postgres database; run files one at a time.
    fileParallelism: false,
  },
});
