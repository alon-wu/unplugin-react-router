import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const viteBin = `${root}node_modules/vite/bin/vite.js`

/**
 * Playwright E2E against two fixture apps:
 * - `tests/e2e-app` (port 5202): base conventions + v0.2 features,
 * - `tests/e2e-layouts-app` (port 5203): v0.3 declarative layouts.
 * Local runs reuse the system Chrome (`channel: 'chrome'`, no download); CI
 * installs the Playwright-managed Chromium instead.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list']],
  use: {
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'app',
      testMatch: /e2e\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:5202' },
    },
    {
      name: 'layouts',
      testMatch: /layouts\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:5203' },
    },
  ],
  webServer: [
    {
      command: `node ${viteBin} --port 5202 --strictPort --host 127.0.0.1`,
      cwd: `${root}tests/e2e-app`,
      url: 'http://127.0.0.1:5202',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `node ${viteBin} --port 5203 --strictPort --host 127.0.0.1`,
      cwd: `${root}tests/e2e-layouts-app`,
      url: 'http://127.0.0.1:5203',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
