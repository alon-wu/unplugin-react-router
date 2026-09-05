import { promises as fs } from 'node:fs'
import { dirname, sep } from 'node:path'
import picomatch from 'picomatch'
import type { ResolvedOptions } from '../options'
import { addFileToTree, createRootNode, printTree, type TreeNode } from './tree'
import { generateRouteRecords } from '../codegen/generateRouteRecords'
import { generateDTS } from '../codegen/generateDTS'
import { createPollingScanner, relToFolder, stripExtension } from './watch'

/** Minimal server API needed by the plugin (implemented per bundler). */
export interface ServerContext {
  /** Invalidate the virtual routes module so it is regenerated on next load. */
  invalidateRoutes: () => false | Promise<void>
  /** Force a full page reload in the browser (dev server). */
  reload: () => void
}

export interface RoutesContext {
  /** (Re)scan all routes folders and rebuild the route tree. */
  scanPages: () => Promise<void>
  /** Generate the source of the virtual routes module from the current tree. */
  getRoutes: () => string
  /** Start polling for page file additions/removals (dev only). */
  startWatcher: () => void
  /** Stop watching (no-op when not started). */
  stopWatcher: () => void
  setServerContext: (server: ServerContext | undefined) => void
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const dirent of dirents) {
    if (dirent.name.startsWith('.')) continue
    const full = dir + sep + dirent.name
    if (dirent.isDirectory()) {
      out.push(...(await walkFiles(full)))
    } else if (dirent.isFile()) {
      out.push(full)
    }
  }
  return out
}

export function createRoutesContext(options: ResolvedOptions): RoutesContext {
  const log = options.logs
    ? (...args: unknown[]) => console.log('[unplugin-react-router]', ...args)
    : () => {}

  let root: TreeNode = createRootNode()
  /** Absolute POSIX paths of every page file, sorted — signature of the tree. */
  let signature = ''

  let server: ServerContext | undefined
  let detachWatcher: (() => void) | undefined

  /** Scan all routes folders and rebuild the tree from scratch. */
  async function scanPages(): Promise<void> {
    const previousSignature = signature
    const collected: string[] = []
    const newRoot = createRootNode()

    for (const folder of options.routesFolder) {
      const files = await walkFiles(folder.src)
      const excluded = folder.exclude.length
        ? picomatch(folder.exclude)
        : null
      const prefixSegs = folder.path
        ? folder.path.split('/').filter(Boolean)
        : []

      for (const file of files) {
        const rel = relToFolder(folder, file)
        const fileName = file.slice(file.lastIndexOf(sep) + 1)
        const stripped = stripExtension(folder, fileName)
        if (stripped === null) continue
        if (excluded && excluded(rel)) continue

        const dirSegs = rel.split('/').slice(0, -1)
        addFileToTree(
          newRoot,
          [...prefixSegs, ...dirSegs],
          stripped,
          toPosix(file)
        )
        collected.push(toPosix(folder.src) + ':' + rel)
      }
    }

    root = newRoot
    signature = [...collected].sort().join('\n')

    if (options.logs) {
      printTree(root, (...args) => log(...args))
    }

    if (signature !== previousSignature && previousSignature !== '') {
      // Route structure changed: invalidate the virtual module (so the next
      // request regenerates it) and reload the page so
      // `createBrowserRouter(routes)` re-runs with the new table.
      await server?.invalidateRoutes?.()
      server?.reload()
    }

    await writeDTS()
  }

  /** Write the ambient `.d.ts` for the virtual module when enabled. */
  async function writeDTS(): Promise<void> {
    const dtsPath = options.dts
    if (!dtsPath) return
    const content = generateDTS()
    const previous = await fs.readFile(dtsPath, 'utf-8').catch(() => '')
    if (previous !== content) {
      await fs.mkdir(dirname(dtsPath), { recursive: true })
      await fs.writeFile(dtsPath, content, 'utf-8')
      log('wrote', dtsPath)
    }
  }

  return {
    async scanPages() {
      await scanPages()
    },

    getRoutes() {
      return generateRouteRecords(root)
    },

    startWatcher() {
      if (detachWatcher || !options.watch) return
      const scanner = createPollingScanner({
        folders: options.routesFolder,
        logger: options.logs
          ? (message: string) => console.log('[unplugin-react-router]', message)
          : undefined,
        onChanged: () => scanPages(),
      })
      detachWatcher = scanner.close
    },

    stopWatcher() {
      detachWatcher?.()
      detachWatcher = undefined
    },

    setServerContext(next) {
      server = next
    },
  }
}
