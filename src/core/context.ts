import { promises as fs } from 'node:fs'
import { dirname, sep } from 'node:path'
import type { ResolvedOptions, ResolvedLayouts } from '../options.ts'
import {
  addFileToTree,
  createRootNode,
  printTree,
  validateTreeConfig,
  type TreeNode,
} from './tree.ts'
import {
  generateRouteRecords,
  type LayoutContext,
} from '../codegen/generateRouteRecords.ts'
import { generateDTS } from '../codegen/generateDTS.ts'
import { extractRouteConfig, type PageRouteConfig } from './routeConfig.ts'
import { createFolderMatcher, relToFolder, stripExtension } from './watch.ts'

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

/** Strip the longest matching layout extension; `null` when none matches. */
function stripLayoutExtension(
  fileName: string,
  extensions: string[]
): string | null {
  for (const ext of extensions) {
    if (fileName.endsWith(ext) && fileName.length > ext.length) {
      return fileName.slice(0, -ext.length)
    }
  }
  return null
}

/**
 * Discover layout files under the layouts directory (any depth), mapping the
 * layout id (file base name) to its absolute path. `components` directories
 * and dot/underscore-prefixed directories are skipped; duplicate ids error.
 */
async function readLayoutFiles(layouts: ResolvedLayouts): Promise<Map<string, string>> {
  const { dir, defaultId, extensions } = layouts
  const files = new Map<string, string>()

  const walk = async (current: string): Promise<void> => {
    const dirents = await fs.readdir(current, { withFileTypes: true }).catch(() => null)
    if (dirents === null) {
      // layouts dir itself missing is reported once by the caller; deeper
      // read errors are treated as "nothing here"
      return
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.') || dirent.name.startsWith('_')) continue
      const full = current + sep + dirent.name
      if (dirent.isDirectory()) {
        if (dirent.name === 'components') continue // not layouts
        await walk(full)
      } else if (dirent.isFile()) {
        const id = stripLayoutExtension(dirent.name, extensions)
        if (id === null) continue
        const existing = files.get(id)
        if (existing) {
          throw new Error(
            `[unplugin-react-router] duplicate layout "${id}": found both ` +
              `${existing} and ${toPosix(full)}. Layout files must have unique ` +
              'names across the layouts directory.'
          )
        }
        files.set(id, toPosix(full))
      }
    }
  }

  const exists = await fs.stat(dir).then((s) => s.isDirectory()).catch(() => false)
  if (!exists) {
    throw new Error(
      `[unplugin-react-router] "layouts" is enabled but the layouts directory ` +
        `"${dir}" does not exist. Create it and add the default layout file ` +
        `"${defaultId}.tsx".`
    )
  }
  await walk(dir)

  if (!files.has(defaultId)) {
    const found = [...files.keys()].sort().join(', ') || '(none)'
    throw new Error(
      `[unplugin-react-router] "layouts.default" refers to "${defaultId}" but no ` +
        `layout file "${defaultId}.tsx"/".jsx" was found under "${dir}" (found: ${found}).`
    )
  }
  return files
}

/** Walk the page tree and collect every route config object. */
function collectConfigs(root: TreeNode): Array<{ config?: PageRouteConfig; file: string }> {
  const out: Array<{ config?: PageRouteConfig; file: string }> = []
  const walk = (node: TreeNode): void => {
    if (node.file) out.push({ config: node.fileConfig, file: node.file })
    if (node.indexFile) out.push({ config: node.indexConfig, file: node.indexFile })
    for (const child of node.children.values()) walk(child)
  }
  walk(root)
  return out
}

/**
 * With `layouts` enabled, directory-based implicit layouts are rejected so the
 * declarative model stays unambiguous: same-name directory layouts, per-folder
 * `layoutFile` layouts, root layout files and pathless group shells.
 */
function assertNoImplicitLayouts(root: TreeNode): void {
  const reject = (file: string, hint: string): never => {
    throw new Error(
      `[unplugin-react-router] "${file}" defines an implicit directory layout, ` +
        `which is not allowed while the "layouts" option is enabled (${hint}). ` +
        'Put shared chrome into a layout component in the layouts directory and ' +
        `declare it on pages with \`export const route = { layout: '…' }\`.`
    )
  }
  if (root.file) {
    reject(root.file, 'root layout file (layoutFile)')
  }
  const walk = (node: TreeNode): void => {
    if (node.kind === 'group') {
      if (node.file || node.indexFile) {
        reject(
          node.file ?? node.indexFile!,
          'pathless group shells (group index / layout file)'
        )
      }
    } else if (node.file && (node.children.size > 0 || node.indexFile !== null)) {
      // same-name layout or per-folder layoutFile component — a directory role
      // node with a component. Plain leaf pages keep their file, that's fine.
      reject(node.file, 'same-name or layoutFile directory layout')
    }
    for (const child of node.children.values()) walk(child)
  }
  for (const child of root.children.values()) walk(child)
}

/** Every declared `layout` must exist among the discovered layout files. */
function assertLayoutsResolve(
  root: TreeNode,
  layoutFiles: Map<string, string>
): void {
  for (const { config, file } of collectConfigs(root)) {
    const layout = config?.layout
    if (layout !== undefined && !layoutFiles.has(layout)) {
      const found = [...layoutFiles.keys()].sort().join(', ') || '(none)'
      throw new Error(
        `[unplugin-react-router] "${file}" declares layout "${layout}" but no ` +
          `layout file "${layout}.tsx"/".jsx" was found in the layouts directory ` +
          `(found: ${found}).`
      )
    }
  }
}

export function createRoutesContext(options: ResolvedOptions): RoutesContext {
  const log = options.logs
    ? (...args: unknown[]) => console.log('[unplugin-react-router]', ...args)
    : () => {}

  let root: TreeNode = createRootNode()
  /** Absolute POSIX paths of every page file, sorted — signature of the tree. */
  let signature = ''
  /** Layout context used by codegen when the `layouts` option is enabled. */
  let layoutContext: LayoutContext | undefined

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

    if (options.layouts) {
      // discover + validate layouts, refresh the layout module map
      const layoutFiles = await readLayoutFiles(options.layouts)
      assertNoImplicitLayouts(newRoot)
      assertLayoutsResolve(newRoot, layoutFiles)
      layoutContext = {
        defaultId: options.layouts.defaultId,
        layoutFiles,
      }
    } else {
      layoutContext = undefined
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
      return generateRouteRecords(root, layoutContext)
    },

    getRoot() {
      return root
    },

    setServerContext(next) {
      server = next
    },
  }
}
