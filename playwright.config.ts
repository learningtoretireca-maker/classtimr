import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "dev",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:8080",
      },
    },
    {
      name: "prod",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "https://timr.classhelpr.com",
      },
    },
  ],
  webServer: {
    command: "npx serve -l 8080 .",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
  },
});
