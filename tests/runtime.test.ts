import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveOptions, type Options } from '../src/options'
import { createRoutesContext } from '../src/core/context'
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from 'react-router'
import { renderToString } from 'react-dom/server'
import React from 'react'

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

/**
 * End-to-end test:
 * 1. the plugin scans the fixture `pages` folder and generates the virtual
 *    routes module source,
 * 2. the source is executed by Vite/Vitest (page modules are lazy loaded),
 * 3. React Router v8's static router renders every URL and its loaders run.
 */
async function renderRoute(
  pathname: string,
  caseOptions: {
    folder?: string
    options?: Options
  } = {}
): Promise<string> {
  const options = resolveOptions({
    root: fixturesRoot,
    routesFolder: caseOptions.folder ?? 'pages',
    dts: false,
    ...caseOptions.options,
  })
  const ctx = createRoutesContext(options)
  await ctx.scanPages()
  const code = ctx.getRoutes()

  const outFile = join(
    dirname(fileURLToPath(import.meta.url)),
    '.gen',
    'routes.mjs'
  )
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, code, 'utf-8')

  const { routes } = (await import(
    `${pathToFileURL(outFile).href}?v=${Date.now()}`
  )) as { routes: Parameters<typeof createStaticHandler>[0] }

  const { query, dataRoutes } = createStaticHandler(routes)
  const context = await query(new Request(`http://localhost${pathname}`))
  if (context instanceof Response) {
    throw new Error(`Unexpected redirect for ${pathname}`)
  }
  const router = createStaticRouter(dataRoutes, context)
  const html = renderToString(
    React.createElement(StaticRouterProvider, {
      router,
      context,
    })
  )
  return html
}

describe('unplugin-react-router end-to-end (React Router v8, SSR)', () => {
  it.each([
    ['/', ['HOME']],
    ['/about', ['ABOUT']],
    ['/users', ['USERS']],
    ['/users/42', ['USER', '42']],
    ['/users/bad', ['USER-ERROR']],
    ['/blog', ['BLOG-LAYOUT', 'BLOG-INDEX']],
    ['/blog/some-post', ['BLOG-LAYOUT', 'POST', 'some-post']],
    ['/cart', ['SHOP-LAYOUT', 'CART']],
    ['/dashboard', ['DASHBOARD']],
    ['/unknown-path', ['NOTFOUND']],
  ])('renders %s', async (pathname, expected) => {
    const html = await renderRoute(pathname)
    for (const text of expected) {
      expect(html).toContain(text)
    }
  })
})

describe('v0.2 additions end-to-end', () => {
  it('renders an optional [[chapter]] file at both the bare and the parameter URL', async () => {
    for (const [pathname, expected] of [
      ['/docs', ['CHAPTER']],
      ['/docs/hello', ['CHAPTER']],
    ] as const) {
      const html = await renderRoute(pathname)
      for (const text of expected) expect(html).toContain(text)
    }
  })

  it('honours a per-file route config: path override + static handle', async () => {
    // the file lives at members/[id].tsx but its config rewrites the URL to
    // /user/:id
    const html = await renderRoute('/user/7', { folder: 'overrides-pages' })
    expect(html).toContain('MEMBER')
    // /member/:id no longer matches anything in that fixture (no catch-all)
    const html2 = await renderRoute('/members/7', { folder: 'overrides-pages' })
    expect(html2).not.toContain('MEMBER')
    void html2
  })

  it('wraps every route in a root layout.tsx (layoutFile option)', async () => {
    const folder = 'layout-pages'
    const layoutCase = { options: { layoutFile: 'layout' as const } }
    const home = await renderRoute('/', { folder, ...layoutCase })
    expect(home).toContain('ROOT-LAYOUT')
    expect(home).toContain('HOME-ROOT')
    const about = await renderRoute('/about', { folder, ...layoutCase })
    expect(about).toContain('ROOT-LAYOUT')
    expect(about).toContain('ABOUT-ROOT')
  })

  it('expands dot-nested pages (dotNesting option)', async () => {
    const html = await renderRoute('/settings/profile', {
      folder: 'dot-pages',
      options: { dotNesting: true },
    })
    expect(html).toContain('SETTINGS-PROFILE')
  })
})
