import { expect, test } from '@playwright/test'

/**
 * Acceptance criteria for the v0.2 routing conventions, checked in a real
 * browser (Chrome via Playwright) against the fixture app in `tests/e2e-app`
 * (which enables `dotNesting` and `layoutFile: 'layout'`).
 *
 * Every case asserts the visible marker of the page that *should* match the
 * URL — a wrong route table (wrong path, layout swallowed, optional URL
 * missing…) fails because the marker of another page (or the 404 catch-all)
 * would be visible instead.
 */

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  // store for later asserts
  ;(page as any).__e2eErrors = errors
})

async function gotoAndExpect(
  page: import('@playwright/test').Page,
  url: string,
  marker: string
) {
  await page.goto(url)
  await expect(page.locator('body')).toContainText(marker, { timeout: 10_000 })
}

test.describe('base file conventions', () => {
  test('index page at /', async ({ page }) => {
    await gotoAndExpect(page, '/', 'E2E-HOME')
  })

  test('static leaf /about', async ({ page }) => {
    await gotoAndExpect(page, '/about', 'E2E-ABOUT')
  })

  test('directory index /users and dynamic /users/:id', async ({ page }) => {
    await gotoAndExpect(page, '/users', 'E2E-USERS')
    await gotoAndExpect(page, '/users/42', 'E2E-USER')
  })

  test('same-name layout blog.tsx wraps /blog and /blog/:slug', async ({
    page,
  }) => {
    await gotoAndExpect(page, '/blog', 'E2E-BLOG-LAYOUT')
    await expect(page.locator('body')).toContainText('E2E-BLOG-INDEX')
    await gotoAndExpect(page, '/blog/hello', 'E2E-BLOG-LAYOUT')
    await expect(page.locator('body')).toContainText('E2E-POST')
  })

  test('pathless group (shop) layout keeps the URL', async ({ page }) => {
    await gotoAndExpect(page, '/cart', 'E2E-SHOP-LAYOUT')
    await expect(page.locator('body')).toContainText('E2E-CART')
  })

  test('catch-all [...rest] renders for unknown URLs', async ({ page }) => {
    await gotoAndExpect(page, '/nope', 'E2E-NOTFOUND')
  })
})

test.describe('root layoutFile wrapper', () => {
  test('every route renders inside the root layout <Outlet/>', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.locator('body')).toContainText('ROOT-LAYOUT')
    await expect(page.locator('body')).toContainText('E2E-HOME')
    await page.goto('/about')
    await expect(page.locator('body')).toContainText('ROOT-LAYOUT')
    await expect(page.locator('body')).toContainText('E2E-ABOUT')
  })
})

test.describe('optional parameter [[chapter]]', () => {
  test('matches both the bare URL and the parameter URL', async ({ page }) => {
    await gotoAndExpect(page, '/docs', 'E2E-CHAPTER')
    await gotoAndExpect(page, '/docs/intro', 'E2E-CHAPTER')
  })
})

test.describe('route-level override (export const route)', () => {
  test('absolute path override promotes /members/:id → /member/:id', async ({
    page,
  }) => {
    await gotoAndExpect(page, '/member/7', 'E2E-OVERRIDE')
  })

  test('the original on-disk path no longer matches', async ({ page }) => {
    await page.goto('/members/7')
    await expect(page.locator('body')).toContainText('E2E-NOTFOUND')
  })
})

test.describe('dot nesting (dotNesting: true)', () => {
  test('settings.profile.tsx is reachable at /settings/profile', async ({
    page,
  }) => {
    await gotoAndExpect(page, '/settings/profile', 'E2E-DOT')
  })
})

test.describe('no console/page errors on happy paths', () => {
  test('typical routes produce no runtime errors', async ({ page }) => {
    for (const url of ['/', '/about', '/users', '/users/42', '/blog/hello', '/docs']) {
      await page.goto(url)
      await page.waitForTimeout(100)
    }
    const errors = (page as any).__e2eErrors as string[]
    expect(errors).toEqual([])
  })
})
