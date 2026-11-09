import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: ["**/node_modules/**", "**/tests/browser/**"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" is a build-time marker with no runtime export; stub it so
      // server modules under test can be imported by vitest.
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url))
    }
  }
});
