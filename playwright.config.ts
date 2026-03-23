import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const localChromePath = "/run/current-system/sw/bin/google-chrome";
const executablePath =
  !process.env.CI && existsSync(localChromePath) ? localChromePath : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run build && bun run astro preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
