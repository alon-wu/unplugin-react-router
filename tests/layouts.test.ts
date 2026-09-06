import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveOptions } from '../src/options'
import { createRoutesContext } from '../src/core/context'

function makeProject(): { dir: string; app: string; pages: string } {
  const dir = mkdtempSync(join(tmpdir(), 'urr-layouts-'))
  const app = join(dir, 'app')
  const pages = join(dir, 'pages')
  mkdirSync(app, { recursive: true })
  mkdirSync(pages, { recursive: true })
  return { dir, app, pages }
}

function ctxFor(dir: string, layouts: { dir: string; default: string }) {
  return createRoutesContext(
    resolveOptions({
      root: dir,
      routesFolder: 'pages',
      layouts,
      dts: false,
    })
  )
}

const page = (name: string) =>
  `export default function ${name}() { return <div>${name}</div> }`
const shell = (id: string) =>
  `import { Outlet } from 'react-router'\nexport default function ${id}Shell() { return <div>${id.toUpperCase()}-SHELL <Outlet /></div> }`

describe('layouts option resolution', () => {
  it('is disabled (null) by default', () => {
    const { dir, pages } = makeProject()
    try {
      writeFileSync(join(pages, 'x.tsx'), page('X'))
      const r = resolveOptions({ root: dir })
      expect(r.layouts).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validates dir/default and resolves the absolute dir', () => {
    const { dir } = makeProject()
    try {
      const r = resolveOptions({
        root: dir,
        layouts: { dir: 'app', default: 'blank' },
      })
      expect(r.layouts).toEqual({
        dir: join(dir, 'app'),
        defaultId: 'blank',
        extensions: ['.tsx', '.jsx'],
      })
      expect(() =>
        resolveOptions({ root: dir, layouts: { dir: '', default: 'x' } })
      ).toThrow(/layouts\.dir/)
      expect(() =>
        resolveOptions({ root: dir, layouts: { dir: 'app', default: '' } })
      ).toThrow(/layouts\.default/)
      expect(() =>
        resolveOptions({ root: dir, layouts: { dir: 'app', default: 'bad name' } })
      ).toThrow(/layouts\.default/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('layouts: default shell + declared shells', () => {
  it('wraps undeclared members in default; moves declared pages to a sibling shell', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      writeFileSync(join(pages, 'index.tsx'), page('Home'))
      writeFileSync(join(pages, 'login.tsx'), page('Login'))
      writeFileSync(
        join(pages, 'dashboard.tsx'),
        `export const route = { layout: 'admin' }\n${page('Dashboard')}`
      )
      mkdirSync(join(pages, 'users'), { recursive: true })
      writeFileSync(join(pages, 'users', 'index.tsx'), page('Users'))
      writeFileSync(join(pages, 'users', '[id].tsx'), page('User'))

      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await ctx.scanPages()
      const code = ctx.getRoutes()

      // every layout module imported exactly once
      expect(code.match(/app\/blank\.tsx/g)).toHaveLength(1)
      expect(code.match(/app\/admin\.tsx/g)).toHaveLength(1)

      // default shell comes first and contains the undeclared members…
      const blankIdx = code.indexOf('app/blank.tsx')
      const adminIdx = code.indexOf('app/admin.tsx')
      expect(blankIdx).toBeGreaterThan(-1)
      expect(adminIdx).toBeGreaterThan(blankIdx)
      const blankChunk = code.slice(blankIdx, adminIdx)
      expect(blankChunk).toContain('path: "login"')
      expect(blankChunk).toContain('path: "users"')
      expect(blankChunk).toContain('path: ":id"')
      expect(blankChunk).not.toContain('path: "dashboard"')

      // …and the declared page lives in the admin shell instead
      const adminChunk = code.slice(adminIdx)
      expect(adminChunk).toContain('path: "dashboard"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('layouts: validation errors', () => {
  it('errors when the layouts dir or the default layout file is missing', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(pages, 'x.tsx'), page('X'))
      // remove the app dir created by makeProject → dir-missing error
      rmSync(app, { recursive: true, force: true })
      const noDir = ctxFor(dir, { dir: 'app', default: 'blank' })
      await expect(noDir.scanPages()).rejects.toThrow(/layouts directory .* does not exist/)

      mkdirSync(app, { recursive: true })
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      const noDefault = ctxFor(dir, { dir: 'app', default: 'blank' })
      await expect(noDefault.scanPages()).rejects.toThrow(/layout file "blank/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds the default layout at any depth and skips components dirs', async () => {
    const { dir, app, pages } = makeProject()
    try {
      const deep = join(app, 'nested')
      mkdirSync(deep, { recursive: true })
      mkdirSync(join(app, 'components'), { recursive: true })
      writeFileSync(join(deep, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'components', 'admin.tsx'), shell('admin'))
      writeFileSync(join(pages, 'x.tsx'), page('X'))
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await ctx.scanPages()
      const code = ctx.getRoutes()
      expect(code).toContain('/app/nested/blank.tsx')
      expect(code).not.toContain('components/admin')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('errors when a page declares an unknown layout', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(
        join(pages, 'dash.tsx'),
        `export const route = { layout: 'ghost' }\n${page('Dash')}`
      )
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await expect(ctx.scanPages()).rejects.toThrow(/layout "ghost"/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects implicit directory layouts while layouts is enabled', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      mkdirSync(join(pages, 'blog'), { recursive: true })
      writeFileSync(join(pages, 'blog.tsx'), page('Blog'))
      writeFileSync(join(pages, 'blog', 'index.tsx'), page('BlogIndex'))
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await expect(ctx.scanPages()).rejects.toThrow(/implicit directory layout/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects mixed layouts inside one top-level block', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      mkdirSync(join(pages, 'users'), { recursive: true })
      writeFileSync(join(pages, 'users', 'index.tsx'), page('Users'))
      writeFileSync(
        join(pages, 'users', '[id].tsx'),
        `export const route = { layout: 'admin' }\n${page('User')}`
      )
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await ctx.scanPages()
      expect(() => ctx.getRoutes()).toThrow(
        /mixes pages with and without a declared layout/
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps layout declarations inert when layouts is disabled', async () => {
    const { dir, pages } = makeProject()
    try {
      writeFileSync(
        join(pages, 'dash.tsx'),
        `export const route = { layout: 'admin' }\n${page('Dash')}`
      )
      const ctx = createRoutesContext(
        resolveOptions({ root: dir, routesFolder: 'pages', dts: false })
      )
      await ctx.scanPages()
      expect(ctx.getRoutes()).toContain('path: "dash"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('layouts: extra coverage (shared shells, index & promoted, catch-all rule)', () => {
  it('shares ONE lazy layout shell between several pages of the same layout', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      for (const name of ['dashboard', 'reports']) {
        writeFileSync(
          join(pages, `${name}.tsx`),
          `export const route = { layout: 'admin' }\n${page(name)}`
        )
      }
      writeFileSync(join(pages, 'login.tsx'), page('Login'))
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await ctx.scanPages()
      const code = ctx.getRoutes()
      expect(code.match(/app\/admin\.tsx/g)).toHaveLength(1)
      const adminChunk = code.slice(code.indexOf('app/admin.tsx'))
      expect(adminChunk).toContain('path: "dashboard"')
      expect(adminChunk).toContain('path: "reports"')
      const blankChunk = code.slice(0, code.indexOf('app/admin.tsx'))
      expect(blankChunk).toContain('path: "login"')
      expect(blankChunk).not.toContain('path: "dashboard"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('lets the root index page declare a layout (moved out of the default shell)', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      writeFileSync(
        join(pages, 'index.tsx'),
        `export const route = { layout: 'admin' }\n${page('Home')}`
      )
      writeFileSync(join(pages, 'login.tsx'), page('Login'))
      writeFileSync(join(pages, '[...rest].tsx'), page('NotFound'))
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await ctx.scanPages()
      const code = ctx.getRoutes()
      const adminChunk = code.slice(code.indexOf('app/admin.tsx'))
      expect(adminChunk).toContain('index: true')
      const blankChunk = code.slice(0, code.indexOf('app/admin.tsx'))
      expect(blankChunk).toContain('path: "login"')
      expect(blankChunk).toContain('path: "*"')
      expect(blankChunk).not.toContain('index: true')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('lets a promoted (absolute path) page declare a layout', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      mkdirSync(join(pages, 'members'), { recursive: true })
      writeFileSync(
        join(pages, 'members', '[id].tsx'),
        `export const route = { path: '/member/:id', layout: 'admin' }\n${page('Member')}`
      )
      writeFileSync(join(pages, 'about.tsx'), page('About'))
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await ctx.scanPages()
      const code = ctx.getRoutes()
      const adminChunk = code.slice(code.indexOf('app/admin.tsx'))
      expect(adminChunk).toContain('path: "/member/:id"')
      const blankChunk = code.slice(0, code.indexOf('app/admin.tsx'))
      expect(blankChunk).not.toContain('member')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a layout declaration on a catch-all ([...rest]) page', async () => {
    const { dir, app, pages } = makeProject()
    try {
      writeFileSync(join(app, 'blank.tsx'), shell('blank'))
      writeFileSync(join(app, 'admin.tsx'), shell('admin'))
      writeFileSync(
        join(pages, '[...rest].tsx'),
        `export const route = { layout: 'admin' }\n${page('NotFound')}`
      )
      const ctx = ctxFor(dir, { dir: 'app', default: 'blank' })
      await expect(ctx.scanPages()).rejects.toThrow(/catch-all pages .* cannot/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
