import { defineConfig } from "@playwright/test";
const executablePath = process.env.PLAYWRIGHT_CHROME_PATH;
export default defineConfig({
  testDir: "./tests/browser", testMatch: "**/*.spec.ts", fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined
  },
  webServer: { command: "node node_modules/vite/bin/vite.js --config tests/browser/vite.config.ts", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
});
