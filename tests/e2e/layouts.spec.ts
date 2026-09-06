import { expect, test } from '@playwright/test'

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
