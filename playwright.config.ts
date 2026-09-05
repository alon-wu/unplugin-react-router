import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const viteBin = `${root}node_modules/vite/bin/vite.js`
const appDir = `${root}tests/e2e-app`

/**
 * Playwright E2E against the dedicated fixture app (`tests/e2e-app`), which
 * enables `dotNesting` + `layoutFile` on top of the base conventions.
 * Uses the system Chrome channel so no browser download is required.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : [['list']],
  use: {
    // Local runs reuse the system Chrome (no download). CI installs and uses
    // the Playwright-managed Chromium instead.
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    baseURL: 'http://127.0.0.1:5202',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome' }],
  webServer: {
    command: `node ${viteBin} --port 5202 --strictPort --host 127.0.0.1`,
    cwd: appDir,
    url: 'http://127.0.0.1:5202',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
