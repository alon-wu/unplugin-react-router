import { expect, test } from '@playwright/test'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = fileURLToPath(new URL('../e2e-layouts-app/src/app', import.meta.url))
const pagesDir = fileURLToPath(
  new URL('../e2e-layouts-app/src/pages', import.meta.url)
)

/**
 * v0.3 declarative layouts acceptance (browser, `tests/e2e-layouts-app`,
 * `layouts: { dir: 'src/app', default: 'blank' }`):
 * - undeclared top-level members render inside the default (blank) shell;
 * - a page declaring `route.layout = 'admin'` is moved out of the default
 *   shell and rendered inside the admin shell instead.
 */

const expectBody = async (
  page: import('@playwright/test').Page,
  url: string,
  markers: string[]
) => {
  await page.goto(url)
  for (const marker of markers) {
    await expect(page.locator('body')).toContainText(marker, { timeout: 10_000 })
  }
}

test.describe('declarative layouts (blank default shell)', () => {
  test('root / renders inside the blank shell', async ({ page }) => {
    await expectBody(page, '/', ['E2ELAY-BLANK', 'E2ELAY-HOME'])
  })

  test('/login and /settings stay in the default shell', async ({ page }) => {
    await expectBody(page, '/login', ['E2ELAY-BLANK', 'E2ELAY-LOGIN'])
    await expectBody(page, '/settings', ['E2ELAY-BLANK', 'E2ELAY-SETTINGS'])
  })

  test('directory members (users/*) stay in the default shell', async ({
    page,
  }) => {
    await expectBody(page, '/users', ['E2ELAY-BLANK', 'E2ELAY-USERS'])
    await expectBody(page, '/users/9', ['E2ELAY-BLANK', 'E2ELAY-USER'])
  })

  test('catch-all 404 stays in the default shell', async ({ page }) => {
    await expectBody(page, '/nope', ['E2ELAY-BLANK', 'E2ELAY-NF'])
  })
})

test.describe('declared layout moves the page to the admin shell', () => {
  test('/dashboard renders inside ADMIN, not BLANK', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('body')).toContainText('E2ELAY-ADMIN')
    await expect(page.locator('body')).toContainText('E2ELAY-DASH')
    await expect(page.locator('body')).not.toContainText('E2ELAY-BLANK')
  })
})

test.describe('layouts dev-mode structural HMR (add/remove layout files)', () => {
  const layoutFile = join(appDir, 'team.tsx')
  const pageFile = join(pagesDir, 'team-page.tsx')
  const layoutSource = `import { Outlet } from 'react-router'
export default function Team() {
  return <div data-testid="shell">E2ELAY-TEAM <Outlet /></div>
}
`
  const pageSource = `export const route = { layout: 'team' }
export default function TeamPage() { return <h1>E2ELAY-TEAMPAGE</h1> }
`

  test('adding a layout file makes pages declaring it work without a restart', async ({
    page,
  }) => {
    try {
      // not there yet → catch-all
      await page.goto('/team-page')
      await expect(page.locator('body')).toContainText('E2ELAY-NF')

      // add BOTH the layout component and a page declaring it while the dev
      // server is running — the plugin rescans and reloads
      writeFileSync(layoutFile, layoutSource)
      writeFileSync(pageFile, pageSource)
      await page.goto('/team-page')
      await expect(page.locator('body')).toContainText('E2ELAY-TEAM', {
        timeout: 15_000,
      })
      await expect(page.locator('body')).toContainText('E2ELAY-TEAMPAGE')
    } finally {
      rmSync(pageFile, { force: true })
      rmSync(layoutFile, { force: true })
    }
  })

  test('removing the layout file breaks the page until the layout returns', async ({
    page,
  }) => {
    writeFileSync(layoutFile, layoutSource)
    writeFileSync(pageFile, pageSource)
    try {
      // warm up
      await page.goto('/team-page')
      await expect(page.locator('body')).toContainText('E2ELAY-TEAMPAGE', {
        timeout: 15_000,
      })

      // remove only the LAYOUT file: the in-memory route table still lazily
      // imports it, so navigating fails until a structural change heals it.
      // Give the dev server time to process the unlink before reloading.
      rmSync(layoutFile, { force: true })
      await page.waitForTimeout(2000)
      await page.goto('/team-page')
      await expect(page.locator('body')).toContainText(
        'Failed to fetch dynamically imported module',
        { timeout: 15_000 }
      )

      // restoring the layout file heals the app without a restart
      writeFileSync(layoutFile, layoutSource)
      await page.goto('/team-page')
      await expect(page.locator('body')).toContainText('E2ELAY-TEAM', {
        timeout: 15_000,
      })
      await expect(page.locator('body')).toContainText('E2ELAY-TEAMPAGE')
    } finally {
      rmSync(pageFile, { force: true })
      rmSync(layoutFile, { force: true })
    }
  })
})
