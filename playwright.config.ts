import { defineConfig, devices } from "@playwright/test";

// Tests the production build as Cloudflare Pages serves it: prerendered pages, deep links, 404.
// Headless Chromium draws WebGL in software (a few frames a second), hence the small window and
// long timeouts; reduced motion keeps knots from autoplaying, so each test starts paused.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: { baseURL: "http://localhost:5174", reducedMotion: "reduce" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 800, height: 600 } },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm preview --port 5174",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
