import { defineConfig, devices } from "@playwright/test";

// The suite runs against the PRODUCTION server (`next build` + `next start`):
// the service worker only registers in production, and dev actively unregisters
// it (see CLAUDE.md, "PWA & the dev service-worker gotcha").
//
// The app ships in two shapes from one codebase (lib/app-mode.ts), so the suite
// runs TWICE — `npm run e2e` is `playwright test && E2E_CURATED=1 playwright test`:
//
//   default        the authoring build; every spec but curated-library.spec.ts
//   E2E_CURATED=1  the curated-library build, which is what beta testers get;
//                  curated-library.spec.ts only
//
// Two passes rather than two servers at once, because both builds write to
// `.next`. Giving the curated one its own `distDir` worked but made Next rewrite
// `next-env.d.ts` and `tsconfig.json` on every run, and left eslint scanning a
// second build directory — three config files churning for one output folder.
const curated = process.env.E2E_CURATED === "1";
const CURATED_SPEC = /curated-library\.spec\.ts/;

const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1440, height: 1000 }
};

// Chromium-based mobile profile: iPhone-ish dimensions with touch and mobile
// emulation. Below 760px the app hides the library panel when a list is
// selected, and below 520px the topbar actions lose their labels — which is
// exactly where a locked build is easiest to get wrong.
const mobile = {
  ...devices["Desktop Chrome"],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
};

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
    command: curated
      ? "npm run build:curated && npm run start"
      : "npm run build && npm run start",
    url: "http://localhost:3000",
    // Never reuse. The two passes serve DIFFERENT builds on the same port, so a
    // leftover server would silently test the wrong one — which has already
    // happened once, with an offline spec failing against a stale server.
    // Failing loudly on a busy port is the cheaper outcome.
    reuseExistingServer: false,
    timeout: 300_000
  },
  projects: curated
    ? [
        { name: "curated", testMatch: CURATED_SPEC, use: desktop },
        { name: "curated-mobile", testMatch: CURATED_SPEC, use: mobile }
      ]
    : [
        { name: "desktop", testIgnore: CURATED_SPEC, use: desktop },
        { name: "mobile", testIgnore: CURATED_SPEC, use: mobile }
      ]
});
