import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests resolve workspace packages from source, so no prior build is needed.
export default defineConfig({
  resolve: {
    alias: {
      "quorum-core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "quorum-mod": fileURLToPath(new URL("./packages/mod/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["packages/*/src/**/*.test.ts"], testTimeout: 60_000 },
});
