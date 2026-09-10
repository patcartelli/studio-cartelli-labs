import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

// Origin only — tests navigate with base-inclusive paths ('/lab/chart'), so
// this must NOT carry the /lab prefix or every goto() would double it.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';

// The webServer readiness probe needs a path the app actually serves, which is
// NOT the same as baseURL. astro.config.mjs sets base:'/lab', so nothing is
// mounted at the bare origin: `npm run dev` answers 404 there and 200 at /lab.
// Playwright treats a 404 as not-ready, so pointing the probe at the origin
// made it wait out the full 300s timeout and abort before running a single
// test — `npm run test` was effectively broken locally.
//
// CI happened to escape this because `npm run preview` (workerd/miniflare)
// answers the bare origin, unlike the dev server — which is why the suite is
// green in CI and hung locally. Probing /lab is correct for both runtimes.
const readyURL = `${baseURL.replace(/\/+$/, '')}/lab`;

export default defineConfig({
  testDir: './tests',
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'html' : 'list',
  use: {
    baseURL,
    contextOptions: {
      reducedMotion: 'reduce',
    },
  },
  webServer: {
    command: isCI ? 'npm run build:preview && npm run preview' : 'npm run dev',
    url: readyURL,
    timeout: 300 * 1000,
    reuseExistingServer: !isCI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'Desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'Tablet',
      use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'Mobile',
      use: { browserName: 'chromium', viewport: { width: 375, height: 812 } },
    },
  ],
});
