import { promises as fs } from 'node:fs'
import { dirname, sep } from 'node:path'
import type { ResolvedOptions } from '../options'
import {
  addFileToTree,
  createRootNode,
  printTree,
  validateTreeConfig,
  type TreeNode,
} from './tree'
import { generateRouteRecords } from '../codegen/generateRouteRecords'
import { generateDTS } from '../codegen/generateDTS'
import { extractRouteConfig, type PageRouteConfig } from './routeConfig'
import { createFolderMatcher, relToFolder, stripExtension } from './watch'

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
  setServerContext: (server: ServerContext | undefined) => void
  /** Get the route tree built by the last scan (read-only use). */
  getRoot: () => TreeNode
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Recursively list files of a folder that pass the folder's page matcher. */
async function walkPageFiles(
  folderSrc: string,
  matches: (rel: string) => boolean
): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.')) continue
      const full = dir + sep + dirent.name
      if (dirent.isDirectory()) {
        await walk(full)
      } else if (dirent.isFile()) {
        if (matches(toPosix(full).slice(folderSrc.length + 1))) {
          out.push(full)
        }
      }
    }
  }
  await walk(folderSrc)
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

  /** Parse the route config (`export const route`) of one page file. */
  async function readConfig(filePath: string): Promise<PageRouteConfig | undefined> {
    try {
      const source = await fs.readFile(filePath, 'utf-8')
      return extractRouteConfig(source, filePath)
    } catch (error) {
      if (error instanceof Error && error.name === 'RouteConfigParseError') {
        throw error
      }
      // unreadable files are simply not pages with a config
      log('could not read', filePath, error)
      return undefined
    }
  }

  /** Scan all routes folders and rebuild the tree from scratch. */
  async function scanPages(): Promise<void> {
    const previousSignature = signature
    const collected: string[] = []
    const newRoot = createRootNode()
    const treeOptions = {
      dotNesting: options.dotNesting,
      layoutFileName: options.layoutFileName,
    }

    for (const folder of options.routesFolder) {
      const matcher = createFolderMatcher(folder)
      const files = await walkPageFiles(folder.src, matcher.matchesFile)
      const prefixSegs = folder.path
        ? folder.path.split('/').filter(Boolean)
        : []

      for (const file of files) {
        const rel = relToFolder(folder, file)
        const fileName = file.slice(file.lastIndexOf(sep) + 1)
        const stripped = stripExtension(folder, fileName)
        if (stripped === null) continue
        const config = await readConfig(file)

        const dirSegs = rel.split('/').slice(0, -1)
        addFileToTree(
          newRoot,
          [...prefixSegs, ...dirSegs],
          stripped,
          toPosix(file),
          treeOptions,
          config
        )
        collected.push(toPosix(folder.src) + ':' + rel)
      }
    }

    // Once every file is inserted a node's final role (leaf vs layout) is
    // known — enforce config placement rules now.
    validateTreeConfig(newRoot)

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
    const content = generateDTS(root)
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

    getRoot() {
      return root
    },

    setServerContext(next) {
      server = next
    },
  }
}
