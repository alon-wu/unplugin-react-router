import { describe, expect, it } from 'vitest'
import { addFileToTree, createRootNode } from '../src/core/tree'
import { collectRoutes } from '../src/codegen/collectPaths'
import { generateDTS } from '../src/codegen/generateDTS'

function build() {
  const root = createRootNode()
  const add = (
    dirs: string[],
    name: string,
    file: string,
    options?: Parameters<typeof addFileToTree>[4]
  ) => addFileToTree(root, dirs, name, file, options)
  add([], 'index', '/p/index.tsx')
  add([], 'about', '/p/about.tsx')
  add(['users'], 'index', '/p/users/index.tsx')
  add(['users'], '[id]', '/p/users/[id].tsx')
  add(['docs'], '[[lang]]', '/p/docs/[[lang]].tsx')
  add(['blog'], 'layout', '/p/blog/layout.tsx', { layoutFileName: 'layout' })
  add(['blog'], 'index', '/p/blog/index.tsx')
  add(['blog'], '[slug]', '/p/blog/[slug].tsx')
  add(['(shop)'], 'cart', '/p/(shop)/cart.tsx')
  add([], '[...rest]', '/p/[...rest].tsx')
  add([], 'layout', '/p/layout.tsx', { layoutFileName: 'layout' })
  add([], 'admin.dashboard', '/p/admin.dashboard.tsx', { dotNesting: true })
  return root
}

describe('collectRoutes', () => {
  it('collects every matcheable URL with its param keys', () => {
    const routes = collectRoutes(build())
    const map = Object.fromEntries(routes.map((r) => [r.fullPath, r.paramKeys]))
    expect(map['/']).toEqual([])
    expect(map['/about']).toEqual([])
    expect(map['/users']).toEqual([])
    expect(map['/users/:id']).toEqual(['id'])
    // optional [[lang]] → bare URL (index) + /docs/:lang
    expect(map['/docs']).toEqual([])
    expect(map['/docs/:lang']).toEqual(['lang'])
    // dedupe: /blog layout + /blog index produce a single '/blog'
    expect(map['/blog']).toEqual([])
    expect(map['/blog/:slug']).toEqual(['slug'])
    // splat (top-level catch-all matches any URL under /)
    expect(map['/*']).toEqual(['*'])
    // group contributes no URL segment
    expect(map['/cart']).toEqual([])
    // dot nesting
    expect(map['/admin/dashboard']).toEqual([])
    // no phantom '[[lang]]' / '(shop)' segments in any URL
    expect(routes.some((r) => r.fullPath.includes('[[lang]]'))).toBe(false)
    expect(routes.some((r) => r.fullPath.includes('(shop)'))).toBe(false)
  })

  it('outputs deterministically sorted paths', () => {
    const paths = collectRoutes(build()).map((r) => r.fullPath)
    expect(paths).toEqual([...paths].sort())
  })
})

describe('generateDTS', () => {
  it('exposes the typed surface for the virtual module', () => {
    const dts = generateDTS(build())
    expect(dts).toContain(`declare module 'unplugin-react-router/routes'`)
    expect(dts).toContain(`export const routes: RouteObject[]`)
    expect(dts).toContain(`export type AppRoutePath =`)
    expect(dts).toContain(`| "/users/:id"`)
    expect(dts).toContain(`| "/docs/:lang"`)
    expect(dts).toContain(`| "/*"`)
    expect(dts).toContain(`"/users/:id": { "id": string }`)
    expect(dts).toContain(`"/docs/:lang": { "lang": string }`)
    expect(dts).toContain(`export type RouteParams<P extends AppRoutePath>`)
    expect(dts).toContain(`export interface RouteConfig`)
    expect(dts).toContain(`layout?: string`)
    expect(dts).toContain(`export type LoaderData<T extends`)
  })

  it('produces an empty-but-valid surface for an empty tree', () => {
    const dts = generateDTS(createRootNode())
    expect(dts).toContain(`export type AppRoutePath = never`)
    expect(dts).toContain(`export interface AppRouteParams {}`)
  })
})
