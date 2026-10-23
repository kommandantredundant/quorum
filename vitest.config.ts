import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests resolve workspace packages from source, so no prior build is needed.
export default defineConfig({
  resolve: {
    alias: {
      "quorum-core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "quorum-mod": fileURLToPath(new URL("./packages/mod/src/index.ts", import.meta.url)),
      "quorum-adapters": fileURLToPath(new URL("./packages/adapters/src/index.ts", import.meta.url)),
      "quorum-ui/client": fileURLToPath(new URL("./packages/ui/src/client.ts", import.meta.url)),
      "quorum-http": fileURLToPath(new URL("./packages/http/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["packages/*/src/**/*.test.ts"], testTimeout: 60_000 },
});
