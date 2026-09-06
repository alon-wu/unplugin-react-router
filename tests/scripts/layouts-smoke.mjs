// Declarative-layouts smoke: boot the playground-layouts vite dev server
// (auto-managed), drive headless Chrome over every route asserting the shell
// markers and the absence of errors, then exercise layout structural HMR
// (add → reachable; delete → fetch error; restore → healed).
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('../..', import.meta.url))
const appDir = join(root, 'playground-layouts')
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const PORT = 5174
const BASE = `http://127.0.0.1:${PORT}`
const appFilesDir = join(appDir, 'src', 'app')
const pagesFilesDir = join(appDir, 'src', 'pages')

const CASES = [
  ['/', 'BLANK SHELL', 'SMOKE-HOME'],
  ['/login', 'BLANK SHELL', 'SMOKE-LOGIN'],
  ['/settings', 'BLANK SHELL', 'SMOKE-SETTINGS'],
  ['/users/5', 'BLANK SHELL', 'SMOKE-USER'],
  ['/dashboard', 'ADMIN SHELL', 'SMOKE-DASH'],
  ['/nope', 'BLANK SHELL', 'SMOKE-NF'],
]

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`dev server did not become ready at ${url}`)
}

/** Navigate repeatedly (SPA reloads) until `predicate` sees the expected text. */
async function refreshUntil(page, url, expectedText, budgetMs = 20_000) {
  const start = Date.now()
  while (Date.now() - start < budgetMs) {
    await page.goto(url).catch(() => {})
    const body = await page.locator('body').innerText().catch(() => '')
    if (body.includes(expectedText)) return true
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

const failures = []
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`)
  if (!cond) failures.push(label)
}

const server = spawn(
  process.execPath,
  [viteBin, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'] }
)
let serverLog = ''
server.stdout.on('data', (d) => (serverLog += String(d)))
server.stderr.on('data', (d) => (serverLog += String(d)))

let browser
try {
  await waitForServer(BASE + '/')
  console.log(`dev server ready on ${BASE}`)

  browser = await chromium.launch({
    // local runs reuse the system Chrome; CI uses the Playwright Chromium
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
  })
  const page = await browser.newPage()

  for (const [url, shell, marker] of CASES) {
    await page.goto(BASE + url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(200)
    const body = await page.locator('body').innerText()
    ok(body.includes(marker) && body.includes(shell), `${url} shows "${marker}" under ${shell}`)
    if (url === '/dashboard') {
      ok(!body.includes('BLANK SHELL'), '/dashboard is NOT inside the BLANK shell')
    }
  }

  // ---- layout structural HMR ----
  const teamLayout = join(appFilesDir, 'team.tsx')
  const teamPage = join(pagesFilesDir, 'team-page.tsx')
  const teamLayoutSource = `import { Outlet } from 'react-router'
export default function Team() {
  return <div data-testid="shell"><header>TEAM SHELL</header><Outlet /></div>
}
`
  const teamPageSource = `export const route = { layout: 'team' }
export default function TeamPage() { return <h1>SMOKE-TEAM</h1> }
`

  // 1) add the layout file + a page declaring it while dev is running
  writeFileSync(teamLayout, teamLayoutSource)
  writeFileSync(teamPage, teamPageSource)
  ok(
    await refreshUntil(page, BASE + '/team-page', 'SMOKE-TEAM'),
    'added layout + page reachable without a restart'
  )

  // 2) delete only the layout file → the referencing page fails to navigate
  rmSync(teamLayout, { force: true })
  await new Promise((r) => setTimeout(r, 2000))
  ok(
    await refreshUntil(page, BASE + '/team-page', 'Failed to fetch dynamically imported module'),
    'deleting the layout surfaces the module fetch error'
  )

  // 3) restore the layout file → healed without a restart
  writeFileSync(teamLayout, teamLayoutSource)
  ok(
    await refreshUntil(page, BASE + '/team-page', 'SMOKE-TEAM'),
    'restoring the layout heals the page'
  )
} catch (error) {
  failures.push(`script error: ${String(error)}`)
  console.log('server log tail:\n' + serverLog.slice(-1500))
} finally {
  rmSync(join(appFilesDir, 'team.tsx'), { force: true })
  rmSync(join(pagesFilesDir, 'team-page.tsx'), { force: true })
  await browser?.close().catch(() => {})
  server.kill('SIGTERM')
}

console.log('---')
if (failures.length === 0) {
  console.log('LAYOUTS SMOKE: ALL OK')
} else {
  console.log('LAYOUTS SMOKE FAILURES:')
  for (const f of failures) console.log(' - ' + f)
  process.exit(1)
}
