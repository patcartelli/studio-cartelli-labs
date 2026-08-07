import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'html' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
    contextOptions: {
      reducedMotion: 'reduce',
    },
  },
  webServer: {
    command: isCI ? 'npm run build:preview && npm run preview' : 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321',
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
