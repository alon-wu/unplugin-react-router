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
   * Root of the project. All paths are resolved relative to this one.
   * @default `process.cwd()`
   */
  root?: string

  /**
   * Generate a `.d.ts` file declaring the `unplugin-react-router/routes`
   * module so TypeScript can type-check it. Defaults to `true` when
   * `typescript` is installed. Can be set to a string filepath.
   * @default `true`
   */
  dts?: boolean | string

  /**
   * Activates debug logs.
   */
  logs?: boolean

  /**
   * Whether to watch the routes folders for changes (dev server only).
   * @default `!process.env.CI`
   */
  watch?: boolean

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
} satisfies Options

export interface RoutesFolderOptionResolved {
  /** Absolute path of the folder. */
  src: string
  /** Path prefix (static segments joined with `/`). */
  path: string
  extensions: string[]
  exclude: string[]
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
  dts: string | false
  logs: boolean
  watch: boolean
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
    return {
      src: nodeResolve(root, option.src),
      path: prefix.replace(/\/+$/, ''),
      extensions: normalizeExtensions(perFolderExtensions, globalExtensions),
      exclude: perFolderExclude,
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

  return {
    root,
    routesFolder,
    dts,
    logs: options.logs ?? DEFAULT_OPTIONS.logs,
    watch: options.watch ?? DEFAULT_OPTIONS.watch,
    _inspect: options._inspect ?? DEFAULT_OPTIONS._inspect,
  }
}
