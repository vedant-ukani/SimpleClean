import { defineConfig, devices } from "@playwright/test";

const webOrigin = "http://localhost:3100";
const apiOrigin = "http://localhost:3101";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["line"]],
  outputDir: "test-results/browser",
  use: {
    baseURL: webOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "tablet-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      },
    },
    {
      name: "tablet-landscape-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "npm run test:browser:server -w @simply-clean/api",
      url: `${apiOrigin}/health/ready`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run test:browser:server -w @simply-clean/web",
      url: `${webOrigin}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        API_BASE_URL: apiOrigin,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
