import { isAbsolute, resolve as nodeResolve } from 'node:path'
import { isPackageExists } from './utils/packageCheck.ts'

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

/**
 * Declarative layout binding (v0.3). When provided, the layout system is
 * enabled:
 *
 * - layout components are discovered recursively under `dir` (files named
 *   after the layout id, e.g. `admin.tsx` for `layout: 'admin'`), skipping
 *   `components` directories and dot/underscore-prefixed folders;
 * - `default` is the id of the layout that wraps every top-level route which
 *   does not declare a layout (it must exist under `dir`);
 * - a page that declares `export const route = { layout: 'admin' }` is moved
 *   out of the default wrapper and wrapped by the `admin` layout instead
 *   (default and named layout wrappers are siblings);
 * - while enabled, directory-based implicit layouts (same-name layout files,
 *   pathless group shells, `layoutFile`) are rejected with guidance.
 */
export interface LayoutsOptions {
  /**
   * Directory (relative to `root`) that contains the layout component files.
   * Layout files may live at any depth inside it. `components` directories
   * are skipped while discovering layouts.
   */
  dir: string

  /**
   * Id of the default layout used for top-level routes that do not declare a
   * `layout`. A matching file must exist under `dir`.
   */
  default: string
}

/** Layout extensions considered while discovering layout files. */
export const LAYOUT_EXTENSIONS = ['.tsx', '.jsx'] as const

export interface ResolvedLayouts {
  /** Absolute path of the layout directory. */
  dir: string
  /** Id of the default layout. */
  defaultId: string
  /** Layout file extensions (longest first). */
  extensions: string[]
}

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
   * Declarative layout binding (see {@link LayoutsOptions}). Absent/`false` =
   * current directory-based behaviour, unchanged.
   * @default `false`
   */
  layouts?: LayoutsOptions | false

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
  /** Declarative layout binding, or `null` when disabled. */
  layouts: ResolvedLayouts | null
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

  let layouts: ResolvedLayouts | null = null
  if (options.layouts !== undefined && options.layouts !== false) {
    const { dir, default: defaultId } = options.layouts
    if (typeof dir !== 'string' || dir.trim() === '') {
      throw new Error(
        '[unplugin-react-router] "layouts.dir" must be a non-empty directory ' +
          'path (e.g. "src/app").'
      )
    }
    if (typeof defaultId !== 'string' || defaultId.trim() === '') {
      throw new Error(
        '[unplugin-react-router] "layouts.default" must be a non-empty layout ' +
          'id (e.g. "blank"). A layout file with that name must exist under ' +
          'the layouts directory.'
      )
    }
    if (!/^[\w-]+$/.test(defaultId)) {
      throw new Error(
        `[unplugin-react-router] "layouts.default" ("${defaultId}") must be a ` +
          'plain file name without extension (letters, digits, "-", "_").'
      )
    }
    layouts = {
      dir: nodeResolve(root, dir),
      defaultId: defaultId.trim(),
      extensions: [...new Set(LAYOUT_EXTENSIONS)].sort(
        (a, b) => b.length - a.length
      ),
    }
  }

  return {
    root,
    routesFolder,
    layoutFileName: layoutFile,
    dotNesting: options.dotNesting ?? DEFAULT_OPTIONS.dotNesting,
    layouts,
    dts,
    logs: options.logs ?? DEFAULT_OPTIONS.logs,
    watch: options.watch ?? DEFAULT_OPTIONS.watch,
    _inspect: options._inspect ?? DEFAULT_OPTIONS._inspect,
  }
}
