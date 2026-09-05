// Playground smoke: drive the real dev server (5173) in headless Chrome,
// visit every route and assert: (a) the expected marker is visible,
// (b) no console/page errors, (c) no React Router default error overlay.
import { chromium } from '@playwright/test'
import { writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:5173'

// URL → marker that must be visible (from playground page sources)
const CASES = [
  ['/', 'unplugin-react-router playground'],
  ['/about', 'About'],
  ['/users', 'Users'],
  ['/users/42', 'User 42'],
  ['/blog', 'Blog'],
  ['/blog/hello-world', 'Post'],
  ['/dashboard', 'Dashboard'],
  ['/cart', 'Cart'],
  ['/checkout', 'Checkout'],
  ['/does-not-exist', '404'],
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const failures = []

for (const [url, marker] of CASES) {
  const errors = []
  const onErr = (m) => {
    if (m.type() !== 'error') return
    const loc = typeof m.location === 'function' ? m.location() : null
    const srcUrl = (loc && loc.url) || ''
    if (srcUrl.includes('favicon')) return // pages have no favicon → harmless 404
    errors.push(m.text())
  }
  page.on('console', onErr)
  page.on('pageerror', (e) => errors.push(String(e)))
  try {
    const resp = await page.goto(BASE + url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(150)
    const body = await page.locator('body').innerText()
    const ok = body.includes(marker)
    const hasErrorOverlay = body.includes('Unexpected Application Error') || body.includes('is not defined')
    if (!ok) failures.push(`/${url}: marker "${marker}" not found (body: ${body.slice(0, 90).replace(/\n/g, ' ')})`)
    if (hasErrorOverlay) failures.push(`/${url}: error overlay visible`)
    if (resp && resp.status() >= 500) failures.push(`/${url}: HTTP ${resp.status()}`)
    for (const e of errors) if (!e.includes('favicon')) failures.push(`/${url}: ${e}`)
    console.log(`${ok && !hasErrorOverlay ? 'PASS' : 'FAIL'} ${url} (${resp?.status()})`)
  } catch (e) {
    failures.push(`/${url}: navigation error ${e}`)
    console.log(`ERROR ${url}: ${e}`)
  } finally {
    page.removeListener('console', onErr)
    page.removeListener('pageerror', onErr)
  }
}

await browser.close()

// Structural HMR spot check on the playground: add then remove a page file
// while the server is running, assert the route appears/disappears.
const pagesDir = fileURLToPath(new URL('../../playground/src/pages', import.meta.url))
const tmp = join(pagesDir, '_smoke_tmp.tsx')
const browser2 = await chromium.launch({ channel: 'chrome', headless: true })
const page2 = await browser2.newPage()
try {
  await page2.goto(BASE + '/_smoke_tmp')
  await page2.waitForTimeout(200)
  const before = await page2.locator('body').innerText()
  const was404 = before.includes('404')
  writeFileSync(tmp, 'export default function Tmp(){ return <h1>SMOKE-OK</h1> }')
  // expect keeps polling until the fresh route renders (plugin triggers full reload)
  await page2.goto(BASE + '/_smoke_tmp')
  await page2.waitForFunction(
    () => document.body && document.body.innerText.includes('SMOKE-OK'),
    { timeout: 15000 }
  )
  const after = await page2.locator('body').innerText()
  console.log(`${after.includes('SMOKE-OK') ? 'PASS' : 'FAIL'} dev HMR add (was 404 before: ${was404})`)
  if (!after.includes('SMOKE-OK')) failures.push('dev HMR add failed')
} finally {
  rmSync(tmp, { force: true })
  // wait for unlink reload and confirm the route is gone again
  await page2.waitForTimeout(2500)
  await page2.goto(BASE + '/_smoke_tmp')
  const gone = await page2.locator('body').innerText()
  console.log(`${gone.includes('404') ? 'PASS' : 'FAIL'} dev HMR remove`)
  if (!gone.includes('404')) failures.push('dev HMR remove failed')
  await browser2.close()
}

console.log('---')
if (failures.length === 0) {
  console.log('PLAYGROUND SMOKE: ALL OK')
} else {
  console.log('PLAYGROUND SMOKE FAILURES:')
  for (const f of failures) console.log(' - ' + f)
  process.exit(1)
}
