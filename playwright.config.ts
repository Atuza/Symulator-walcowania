import { defineConfig, devices } from "@playwright/test";

// A locally installed Chromium can stand in for Playwright's own build (PW_CHROMIUM=path to chrome).
const chromium = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

// Browser tests of the built app: desktop Chromium, a phone, and Safari's engine on an iPad.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4174",
    locale: "pl-PL",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: chromium } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: chromium } },
    { name: "ipad", use: { ...devices["iPad (gen 7) landscape"] } },
  ],
  webServer: {
    command: "npx vite build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
