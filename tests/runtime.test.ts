import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveOptions } from '../src/options'
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
async function renderRoute(pathname: string): Promise<string> {
  const options = resolveOptions({
    root: fixturesRoot,
    routesFolder: 'pages',
    dts: false,
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
  const context = await query(
    new Request(`http://localhost${pathname}`)
  )
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
