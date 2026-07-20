import { defineConfig, devices } from "@playwright/test";

// The suite runs against the PRODUCTION server (npm run build && npm run start):
// the service worker only registers in production, and dev actively unregisters
// it (see CLAUDE.md, "PWA & the dev service-worker gotcha").
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      // Chromium-based mobile profile: iPhone-ish dimensions with touch and
      // mobile emulation. Below 760px the app hides the library panel when a
      // list is selected and shows icon-only topbar actions.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    }
  ]
});
