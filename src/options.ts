import { isAbsolute, resolve as nodeResolve } from 'node:path'
import { isPackageExists } from './utils/packageCheck'

/**
 * Options for a single routes folder, mirroring `unplugin-vue-router`'s
 * `RoutesFolderOption` shape but trimmed down.
 */
export interface RoutesFolderOption {
  /**
   * Folder to scan for page files. **Cannot be a glob**. This section is
   * removed from the resulting paths.
   */
  src: string

  /**
   * Static path prefix added **as is** to every route of this folder. May
   * contain `/` to create several nested segments. Cannot start with `/`.
   * @default `''`
   */
  path?: string

  /**
   * Override the global `extensions` option for this folder.
   */
  extensions?: string[] | ((existing: string[]) => string[])

  /**
   * Override the global `exclude` option for this folder. Globs are relative
   * to this folder's `src`.
   */
  exclude?: string[] | ((existing: string[]) => string[])

  /**
   * Positive glob filter (picomatch, relative to this folder's `src`).
   * When provided, only files matching **one** of these patterns are
   * considered page files (extension + `exclude` still apply). Patterns match
   * the whole relative path including the extension, e.g.
   * `['**\/*.page.tsx', '**\/*.route.tsx']`.
   *
   * An empty array means *no file matches* — do not pass `[]` unless you
   * really want this folder to produce no routes.
   * @default `undefined` (no restriction)
   */
  filePatterns?: string[] | ((existing: string[]) => string[])
}

export type RoutesFolder =
  | string
  | RoutesFolderOption
  | Array<string | RoutesFolderOption>

export interface Options {
  /**
   * Folder(s) to scan for page files and generate routes. Defaults to
   * `'src/pages'`. Can be an array to scan several folders.
   */
  routesFolder?: RoutesFolder

  /**
   * Extensions of files considered to be pages. Cannot be empty.
   * @default `['.tsx', '.jsx']`
   */
  extensions?: string[]

  /**
   * Array of picomatch globs to ignore, relative to each scanned folder.
   * @default `[]`
   */
  exclude?: string[]

  /**
   * Optional special file name (without extension, e.g. `'layout'`) used as
   * the layout component of every folder that contains a file with that name
   * (`layout.tsx`). Off by default — without it, layouts are declared with
   * the *same-name* convention (`blog.tsx` next to `blog/`).
   *
   * When enabled:
   * - `layout.tsx` inside a folder becomes that path segment's layout
   *   (it is **not** a page),
   * - a `layout.tsx` at the routes folder root becomes a pathless wrapper
   *   layout around every route,
   * - the name is reserved: you cannot have a static `/layout` page while
   *   this option is on (rename it or use a route group).
   * @default `false`
   */
  layoutFile?: string | false

  /**
   * Expand dots in file names into nested static path segments without UI
   * nesting: `users.create.tsx` → `/users/create` (and `users.create.index.tsx`
   * → `/users/create`). Off by default, where a dot is a literal character
   * (`a.b.tsx` → `/a.b`). Only plain static names (`[A-Za-z0-9_-]+`) can be
   * joined by dots; `[param]`, `[...splat]` or `(group)` segments must stay
   * whole segments on disk.
   * @default `false`
   */
  dotNesting?: boolean

  /**
   * Root of the project. All paths are resolved relative to this one.
   * @default `process.cwd()`
   */
  root?: string

  /**
   * Generate a `.d.ts` file declaring the `unplugin-react-router/routes`
   * module (routes type, `AppRoutePath`, `RouteParams`…) so TypeScript can
   * type-check it. Defaults to `true` when `typescript` is installed. Can be
   * set to a string filepath.
   * @default `true`
   */
  dts?: boolean | string

  /**
   * Activates debug logs.
   */
  logs?: boolean

  /**
   * How to detect page file additions/removals during development:
   *
   * - `true` (default): attach to the bundler/dev-server file watcher when
   *   available, fall back to polling otherwise,
   * - `'polling'`: force the polling scanner (used when the bundler watcher
   *   events cannot be reliably tapped, e.g. some Vite 8 / Rolldown setups),
   * - `false`: never watch (page changes require a dev-server restart).
   * @default `!process.env.CI`
   */
  watch?: boolean | 'polling'

  /**
   * Allows inspection by vite-plugin-inspect by not adding the leading `\0`
   * to virtual module ids.
   * @internal
   */
  _inspect?: boolean
}

export const DEFAULT_OPTIONS = {
  extensions: ['.tsx', '.jsx'],
  exclude: [],
  routesFolder: 'src/pages',
  root: process.cwd(),
  dts: true,
  logs: false,
  _inspect: false,
  watch: !process.env.CI,
  layoutFile: false,
  dotNesting: false,
} satisfies Options

export interface RoutesFolderOptionResolved {
  /** Absolute path of the folder. */
  src: string
  /** Path prefix (static segments joined with `/`). */
  path: string
  extensions: string[]
  exclude: string[]
  /** Positive glob filter (relative paths incl. extension) or `null`. */
  filePatterns: string[] | null
}

function normalizeExtensions(
  extensions: string[] | undefined,
  defaultValue: string[]
): string[] {
  const source = extensions ?? defaultValue
  if (source.length === 0) {
    throw new Error(
      '[unplugin-react-router] "extensions" cannot be empty. Please specify at least one extension.'
    )
  }
  const result = source.map((ext) => {
    if (!ext.startsWith('.')) {
      throw new Error(
        `[unplugin-react-router] Invalid extension "${ext}". Extensions must start with a dot.`
      )
    }
    return ext
  })
  // longest first so `index.page.tsx` style suffixes match before plain `.tsx`
  return [...new Set(result)].sort((a, b) => b.length - a.length)
}

function normalizeFilePatterns(
  filePatterns: string[] | null | undefined
): string[] | null {
  if (filePatterns === undefined || filePatterns === null) return null
  if (filePatterns.length === 0) {
    throw new Error(
      '[unplugin-react-router] "filePatterns" cannot be an empty array: no file ' +
        'would match. Remove the option (or the folder) instead.'
    )
  }
  return [...new Set(filePatterns)]
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

export function resolveOverridable<T>(
  defaultValue: T,
  value?: T | ((existing: T) => T)
): T {
  return typeof value === 'function'
    ? (value as (existing: T) => T)(defaultValue)
    : (value ?? defaultValue)
}

export interface ResolvedOptions {
  root: string
  routesFolder: RoutesFolderOptionResolved[]
  /** Special layout file name (without extension) or `null` when disabled. */
  layoutFileName: string | null
  /** Expand dots in file names into nested static segments. */
  dotNesting: boolean
  dts: string | false
  logs: boolean
  watch: boolean | 'polling'
  _inspect: boolean
}

export function resolveOptions(options: Options = {}): ResolvedOptions {
  const root = options.root
    ? isAbsolute(options.root)
      ? options.root
      : nodeResolve(process.cwd(), options.root)
    : process.cwd()

  const globalExtensions = normalizeExtensions(options.extensions, DEFAULT_OPTIONS.extensions)
  const globalExclude = options.exclude ?? DEFAULT_OPTIONS.exclude

  const foldersRaw = (
    options.routesFolder === undefined
      ? DEFAULT_OPTIONS.routesFolder
      : options.routesFolder
  ) as RoutesFolder

  const folderList = (isArray(foldersRaw) ? foldersRaw : [foldersRaw]) as Array<
    string | RoutesFolderOption
  >
  const routesFolder: RoutesFolderOptionResolved[] = folderList.map((folder) => {
    const option =
      typeof folder === 'string' ? { src: folder } : (folder as RoutesFolderOption)
    const prefix = option.path ?? ''
    if (prefix.startsWith('/')) {
      throw new Error(
        `[unplugin-react-router] routesFolder "${option.src}" path prefix cannot start with "/".`
      )
    }
    const perFolderExtensions = resolveOverridable(
      globalExtensions,
      option.extensions
    )
    const perFolderExclude = resolveOverridable(
      globalExclude,
      option.exclude as
        | string[]
        | ((existing: string[]) => string[])
        | undefined
    )
    let perFolderPatterns: string[] | null = null
    if (option.filePatterns !== undefined) {
      perFolderPatterns = resolveOverridable(
        [] as string[],
        option.filePatterns as
          | string[]
          | ((existing: string[]) => string[])
          | undefined
      )
    }
    return {
      src: nodeResolve(root, option.src),
      path: prefix.replace(/\/+$/, ''),
      extensions: normalizeExtensions(perFolderExtensions, globalExtensions),
      exclude: perFolderExclude,
      filePatterns: normalizeFilePatterns(perFolderPatterns),
    }
  })

  let dts: string | false
  if (options.dts === false) {
    dts = false
  } else if (typeof options.dts === 'string') {
    dts = nodeResolve(root, options.dts)
  } else if (
    options.dts === true ||
    (options.dts === undefined &&
      (isPackageExists('typescript', root) || isPackageExists('typescript')))
  ) {
    dts = nodeResolve(root, 'typed-routes.d.ts')
  } else {
    dts = false
  }

  const layoutFile =
    typeof options.layoutFile === 'string' && options.layoutFile.trim() !== ''
      ? options.layoutFile.trim()
      : null
  if (
    layoutFile !== null &&
    !/^[\w-]+$/.test(layoutFile)
  ) {
    throw new Error(
      `[unplugin-react-router] "layoutFile" must be a plain file name without ` +
        `extension ("${options.layoutFile}"). Use e.g. layoutFile: 'layout'.`
    )
  }

  return {
    root,
    routesFolder,
    layoutFileName: layoutFile,
    dotNesting: options.dotNesting ?? DEFAULT_OPTIONS.dotNesting,
    dts,
    logs: options.logs ?? DEFAULT_OPTIONS.logs,
    watch: options.watch ?? DEFAULT_OPTIONS.watch,
    _inspect: options._inspect ?? DEFAULT_OPTIONS._inspect,
  }
}
