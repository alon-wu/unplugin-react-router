import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { resolveOptions } from '../src/options'
import { createRoutesContext } from '../src/core/context'
import reactRouter from '../src/vitePlugin'

function tmpProject(): { dir: string; pages: string } {
  const dir = mkdtempSync(join(tmpdir(), 'urr-plugin-'))
  const pages = join(dir, 'pages')
  mkdirSync(pages, { recursive: true })
  return { dir, pages }
}

describe('resolveOptions — v0.2 options', () => {
  it('defaults layoutFile to off and filePatterns to none', () => {
    const { dir } = tmpProject()
    try {
      const r = resolveOptions({ root: dir })
      expect(r.layoutFileName).toBeNull()
      expect(r.dotNesting).toBe(false)
      expect(r.routesFolder[0].filePatterns).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('validates layoutFile and filePatterns', () => {
    const { dir } = tmpProject()
    try {
      expect(() => resolveOptions({ root: dir, layoutFile: 'layout.tsx' })).toThrow(
        /must be a plain file name/
      )
      expect(() =>
        resolveOptions({ root: dir, routesFolder: { src: 'pages', filePatterns: [] } })
      ).toThrow(/cannot be an empty array/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves per-folder filePatterns', () => {
    const { dir } = tmpProject()
    try {
      const r = resolveOptions({
        root: dir,
        routesFolder: {
          src: 'pages',
          filePatterns: (existing) => [...existing, '**/*.page.tsx'],
        },
      })
      expect(r.routesFolder[0].filePatterns).toEqual(['**/*.page.tsx'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('context scanning — v0.2 options', () => {
  it('only treats filePatterns matches as pages', async () => {
    const { dir, pages } = tmpProject()
    try {
      writeFileSync(join(pages, 'home.tsx'), 'export default function H() { return <div>H</div> }')
      writeFileSync(join(pages, 'admin.page.tsx'), 'export default function A() { return <div>A</div> }')
      const ctx = createRoutesContext(
        resolveOptions({
          root: dir,
          routesFolder: { src: 'pages', filePatterns: ['**/*.page.tsx'] },
          dts: false,
        })
      )
      await ctx.scanPages()
      const code = ctx.getRoutes()
      expect(code).toContain('admin.page')
      expect(code).not.toContain('home')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('extracts route configs from real files during scan', async () => {
    const { dir, pages } = tmpProject()
    try {
      const sub = join(pages, 'members')
      mkdirSync(sub, { recursive: true })
      writeFileSync(
        join(sub, '[id].tsx'),
        `export const route = { path: '/user/:id', handle: { crumb: 'Member' } }
         export default function M() { return <div>M</div> }`
      )
      const ctx = createRoutesContext(
        resolveOptions({ root: dir, routesFolder: 'pages', dts: false })
      )
      await ctx.scanPages()
      const root = ctx.getRoot()
      const member = root.children.get('members')!.children.get('[id]')!
      expect(member.fileConfig?.path).toBe('/user/:id')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('vite plugin dev-server wiring', () => {
  it('attaches the page watcher and reloads on add', async () => {
    const { dir, pages } = tmpProject()
    try {
      writeFileSync(join(pages, 'home.tsx'), 'export default function H() { return <div>H</div> }')
      const plugin = reactRouter({
        root: dir,
        routesFolder: 'pages',
        dts: false,
      }) as any

      const watcher = new EventEmitter()
      const send = vi.fn()
      const httpOnce = vi.fn()
      const fakeServer = {
        watcher,
        ws: { send },
        httpServer: { once: httpOnce },
        moduleGraph: { getModuleById: () => undefined },
      }
      // initial scan (vite calls buildStart) so that later structural
      // changes can be detected against a non-empty baseline
      await plugin.buildStart()
      plugin.configureServer(fakeServer)

      // structural change: add a page file
      writeFileSync(join(pages, 'about.tsx'), 'export default function A() { return <div>A</div> }')
      watcher.emit('all', 'add', join(pages, 'about.tsx'))

      // wait for the debounce + scan
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(send).toHaveBeenCalledWith({ type: 'full-reload' })

      const code = plugin.load('\0unplugin-react-router/routes')
      expect(code).toContain('/about')

      // cleanup is registered on the http server 'close' event (NOT returned
      // from configureServer — Vite 8 would invoke a returned function at once)
      const closeCall = httpOnce.mock.calls.find((c) => c[0] === 'close')
      expect(closeCall).toBeTruthy()
      closeCall![1]()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses the polling scanner when watch is "polling"', async () => {
    const { dir, pages } = tmpProject()
    try {
      writeFileSync(join(pages, 'home.tsx'), 'export default function H() { return <div>H</div> }')
      const plugin = reactRouter({
        root: dir,
        routesFolder: 'pages',
        dts: false,
        watch: 'polling',
      }) as any
      const send = vi.fn()
      const fakeServer = {
        watcher: null,
        ws: { send },
        httpServer: { once: vi.fn() },
        moduleGraph: { getModuleById: () => undefined },
      }
      await plugin.buildStart()
      const httpOnce = vi.fn()
      fakeServer.httpServer = { once: httpOnce }
      plugin.configureServer(fakeServer)

      // let the polling scanner establish its baseline first
      await new Promise((resolve) => setTimeout(resolve, 500))
      writeFileSync(join(pages, 'polls.tsx'), 'export default function P() { return <div>P</div> }')
      await new Promise((resolve) => setTimeout(resolve, 900))
      expect(send).toHaveBeenCalledWith({ type: 'full-reload' })
      // stop the polling scanner through the registered close handler
      const closeCall = httpOnce.mock.calls.find((c) => c[0] === 'close')
      closeCall![1]()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
