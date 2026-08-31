import { defineConfig, devices } from "@playwright/test";

if (!process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD) {
  throw new Error(
    "E2E_USER_EMAIL and E2E_USER_PASSWORD must identify a disposable Supabase test account."
  );
}

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
