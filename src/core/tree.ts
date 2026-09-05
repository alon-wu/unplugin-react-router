/**
 * Route tree built from scanned page files.
 *
 * Mirrors `unplugin-vue-router`'s tree concepts but is trimmed down to what
 * maps onto React Router route objects:
 *
 * - a *directory* with an `index` file gets an `{ index: true }` child record,
 * - a *file sharing the name of its directory* (e.g. `users.tsx` + `users/`)
 *   becomes the layout component of that path segment,
 * - `(name)` directories are pathless (layout / grouping only),
 * - `[id]` segments become `:id`, `[...rest]` files become the `*` splat,
 * - `[[id]]` files (optional parameter) become **two** records: an
 *   `{ index: true }` child (no segment) plus a `:id` child — both lazily
 *   loading the same module,
 * - with `TreeOptions.dotNesting`, dots in file names expand into nested
 *   static segments (`users.create.tsx` → `/users/create`),
 * - with `TreeOptions.layoutFileName`, a file named like the option
 *   (`layout.tsx`) inside a folder becomes that folder's layout component.
 */

import type { PageRouteConfig } from './routeConfig'

export type SegmentKind = 'group' | 'static' | 'param' | 'splat'

export interface TreeNode {
  /** Raw segment name as found on disk (`''` for roots). */
  rawSegment: string
  kind: SegmentKind
  /** React Router path segment: `:id`, `*`, the raw static name or `''` for pathless nodes. */
  pathSegment: string
  /** Layout / leaf route module file for this segment (absolute path). */
  file: string | null
  /** Per-file route config (`export const route`) of `file`, when present. */
  fileConfig?: PageRouteConfig
  /** `index` module file of this directory (absolute path). */
  indexFile: string | null
  /** Per-file route config of `indexFile`, when present. */
  indexConfig?: PageRouteConfig
  /** Keyed by raw segment name. */
  children: Map<string, TreeNode>
  parent: TreeNode | null
}

/** Extra, opt-in conventions applied while inserting files. */
export interface TreeOptions {
  /** Expand dots in file names into nested static segments. */
  dotNesting?: boolean
  /** Special file name (no extension) used as per-folder layout (`null` = off). */
  layoutFileName?: string | null
}

function createNode(partial: {
  rawSegment: string
  kind: SegmentKind
  pathSegment: string
}): TreeNode {
  return {
    rawSegment: partial.rawSegment,
    kind: partial.kind,
    pathSegment: partial.pathSegment,
    file: null,
    indexFile: null,
    children: new Map(),
    parent: null,
  }
}

export function createRootNode(): TreeNode {
  return createNode({ rawSegment: '', kind: 'static', pathSegment: '' })
}

const PARAM_RE = /^\[([\w-]+)\]$/
const SPLAT_RE = /^\[\.\.\.([\w-]+)\]$/
const OPTIONAL_PARAM_RE = /^\[\[([\w-]+)\]\]$/
const OPTIONAL_SPLAT_RE = /^\[\[\.\.\.([\w-]+)\]\]$/
const GROUP_RE = /^\(([\w-]+)\)$/
const STRUCTURAL_CHARS_RE = /[:*?]/

function assertSafeStaticName(raw: string, filePath: string): void {
  if (STRUCTURAL_CHARS_RE.test(raw)) {
    throw new Error(
      `[unplugin-react-router] "${filePath}": segment "${raw}" contains characters (` +
        '`:`, `*`, `?`) that conflict with React Router path syntax. ' +
        'Rename the file/folder.'
    )
  }
  if (raw.includes('[') || raw.includes(']')) {
    const optionalHint = raw.startsWith('[[')
      ? 'Optional (`[[id]]`) segments are only supported on files and are ' +
        'split into an index route plus a `:id` route automatically.'
      : ''
    throw new Error(
      `[unplugin-react-router] "${filePath}": unsupported segment "${raw}". Only whole-segment ` +
        'params (`[id]`), whole-segment splats (`[...rest]`) and static names are supported. ' +
        'Optional (`[[id]]`), repeatable (`[id]+`) and partial (`prefix-[id]`) segments cannot be ' +
        `expressed with React Router path syntax. ${optionalHint}`
    )
  }
}

/**
 * Parse a directory segment name. `index`, splat, optional and group-file
 * names are invalid for directories.
 */
export function parseDirSegment(raw: string, filePath: string): TreeNode {
  if (raw === 'index') {
    throw new Error(
      `[unplugin-react-router] "${filePath}": directories cannot be named "index". ` +
        'Put an `index` file inside the parent directory instead.'
    )
  }
  const group = GROUP_RE.exec(raw)
  if (group) {
    return createNode({ rawSegment: raw, kind: 'group', pathSegment: '' })
  }
  const splat = SPLAT_RE.exec(raw)
  if (splat) {
    throw new Error(
      `[unplugin-react-router] "${filePath}": splat segments ("${raw}") cannot be ` +
        'directories. Use a `[...rest].tsx` file inside a directory instead.'
    )
  }
  if (OPTIONAL_PARAM_RE.test(raw) || OPTIONAL_SPLAT_RE.test(raw)) {
    throw new Error(
      `[unplugin-react-router] "${filePath}": optional segments ("${raw}") cannot be ` +
        'directories. Optional parameters are only supported on files ' +
        '(`[[lang]].tsx`); use an `[lang]` directory (required) or split the ' +
        'folder into an index route plus a parameter route.'
    )
  }
  const param = PARAM_RE.exec(raw)
  if (param) {
    return createNode({ rawSegment: raw, kind: 'param', pathSegment: `:${param[1]}` })
  }
  assertSafeStaticName(raw, filePath)
  return createNode({ rawSegment: raw, kind: 'static', pathSegment: raw })
}

/** Parse a file segment name (the file name without its extension). */
export function parseFileSegment(raw: string, filePath: string): TreeNode {
  if (raw === 'index') {
    // handled by the caller, kept here for clarity
    throw new Error(
      `[unplugin-react-router] "${filePath}": internal error, "index" must be handled by the caller.`
    )
  }
  if (GROUP_RE.test(raw)) {
    throw new Error(
      `[unplugin-react-router] "${filePath}": route groups must be directories ` +
        `(e.g. "${raw}/index.tsx` +
        '). A single file cannot be a group.'
    )
  }
  const splat = SPLAT_RE.exec(raw)
  if (splat) {
    return createNode({ rawSegment: raw, kind: 'splat', pathSegment: '*' })
  }
  if (OPTIONAL_PARAM_RE.test(raw) || OPTIONAL_SPLAT_RE.test(raw)) {
    // handled by the caller (addFileToTree) — kept here as a safety net
    throw new Error(
      `[unplugin-react-router] "${filePath}": optional segments must be handled ` +
        'by the caller (split into index + parameter).'
    )
  }
  const param = PARAM_RE.exec(raw)
  if (param) {
    return createNode({ rawSegment: raw, kind: 'param', pathSegment: `:${param[1]}` })
  }
  assertSafeStaticName(raw, filePath)
  return createNode({ rawSegment: raw, kind: 'static', pathSegment: raw })
}

function ensureChild(
  parent: TreeNode,
  raw: string,
  parse: (raw: string, filePath: string) => TreeNode,
  filePath: string
): TreeNode {
  const existing = parent.children.get(raw)
  if (existing) {
    if (existing.kind === 'splat') {
      throw new Error(
        `[unplugin-react-router] "${filePath}": a splat route ("${raw}") cannot contain children.`
      )
    }
    return existing
  }
  const node = parse(raw, filePath)
  node.parent = parent
  parent.children.set(raw, node)
  return node
}

/** Throw when a config key cannot apply to the record this file produces. */
function assertConfigUsable(
  config: PageRouteConfig | undefined,
  filePath: string,
  context: 'index' | 'layout' | 'leaf' | 'optional'
): void {
  if (!config) return
  if (config.path !== undefined) {
    if (context !== 'leaf') {
      throw new Error(
        `[unplugin-react-router] "${filePath}": route config "path" overrides are ` +
          `only supported on leaf page files (not ${context === 'index' ? 'index' : context === 'layout' ? 'layout' : 'optional'} files). ` +
          (context === 'index'
            ? 'The URL of an index route is its parent path; remove "path".'
            : context === 'layout'
              ? 'The URL of a layout comes from its directory segment; remove "path".'
              : 'An optional segment file already produces two URLs; remove "path".')
      )
    }
  }
  if (config.caseSensitive !== undefined) {
    if (context === 'index') {
      throw new Error(
        `[unplugin-react-router] "${filePath}": route config "caseSensitive" cannot apply to ` +
          'an index route (it matches exactly its parent path). Remove it.'
      )
    }
    if (context === 'optional') {
      throw new Error(
        `[unplugin-react-router] "${filePath}": route config "caseSensitive" is ambiguous on an ` +
          'optional segment file (it produces both an index and a parameter route). ' +
          'Use separate `index` + `[param]` files instead.'
      )
    }
  }
}

/**
 * Insert one page file into the tree. `dirSegments` are the directory raw
 * names between the folder root and the file, `fileName` is the file name
 * without extension, `filePath` is the absolute file path.
 */
export function addFileToTree(
  root: TreeNode,
  dirSegments: string[],
  fileName: string,
  filePath: string,
  options?: TreeOptions,
  config?: PageRouteConfig
): void {
  let node = root
  for (const seg of dirSegments) {
    node = ensureChild(node, seg, parseDirSegment, filePath)
  }

  if (fileName === 'index') {
    assertConfigUsable(config, filePath, 'index')
    if (node.indexFile && node.indexFile !== filePath) {
      throw new Error(
        `[unplugin-react-router] Duplicate index file for "${node.rawSegment || '<root>'}": ` +
          `${node.indexFile} and ${filePath}`
      )
    }
    node.indexFile = filePath
    if (config) node.indexConfig = config
    return
  }

  const layoutFileName = options?.layoutFileName ?? null

  // optional parameter/splat file → index route (no segment) + parameter route
  const optionalParam = OPTIONAL_PARAM_RE.exec(fileName)
  const optionalSplat = OPTIONAL_SPLAT_RE.exec(fileName)
  if (optionalParam || optionalSplat) {
    const name = optionalParam ? optionalParam[1] : optionalSplat![1]
    assertConfigUsable(config, filePath, 'optional')
    if (node.indexFile && node.indexFile !== filePath) {
      throw new Error(
        `[unplugin-react-router] Duplicate index file for "${node.rawSegment || '<root>'}": ` +
          `an optional segment file ("${fileName}") needs the bare URL, but it is taken by ` +
          `${node.indexFile} and ${filePath}. Remove the index file or the optional file.`
      )
    }
    node.indexFile = filePath
    if (config) node.indexConfig = config
    const paramKey = optionalParam ? `[${name}]` : `[...${name}]`
    const existing = node.children.get(paramKey)
    if (existing) {
      throw new Error(
        `[unplugin-react-router] Duplicate route for "${node.rawSegment || '<root>'}" segment ` +
          `"${paramKey}": the optional file "${fileName}" conflicts with ${existing.file ?? paramKey}.`
      )
    }
    const child = parseFileSegment(paramKey, filePath)
    child.parent = node
    child.file = filePath
    if (config) child.fileConfig = config
    node.children.set(paramKey, child)
    return
  }

  // per-folder layout special file (e.g. layout.tsx) — becomes this folder's layout
  if (layoutFileName !== null && fileName === layoutFileName) {
    assertConfigUsable(config, filePath, 'layout')
    if (node.file && node.file !== filePath) {
      throw new Error(
        `[unplugin-react-router] Duplicate layout file for "${node.rawSegment || '<root>'}": ` +
          `${node.file} and ${filePath}`
      )
    }
    node.file = filePath
    if (config) node.fileConfig = config
    return
  }

  // dot-nesting: a.b.tsx → a/b.tsx (a does not produce UI on its own)
  if (
    options?.dotNesting &&
    fileName.includes('.') &&
    !fileName.startsWith('.') &&
    !fileName.includes('[') &&
    !fileName.includes(']')
  ) {
    const parts = fileName.split('.')
    for (const part of parts) {
      if (part === '') {
        throw new Error(
          `[unplugin-react-router] "${filePath}": dot-nesting cannot express empty ` +
            `segments ("${fileName}").`
        )
      }
      if (/[()]/.test(part)) {
        throw new Error(
          `[unplugin-react-router] "${filePath}": dot-nesting only supports plain static ` +
            `names ("${fileName}"). Segments like "[id]", "[...x]" or "(x)" must be whole ` +
            'files/directories.'
        )
      }
      assertSafeStaticName(part, filePath)
    }
    // Register every intermediate part as a directory segment, then let the
    // recursion handle the final one (index handling included).
    addFileToTree(
      root,
      [...dirSegments, ...parts.slice(0, -1)],
      parts[parts.length - 1],
      filePath,
      options,
      config
    )
    return
  }

  const existing = node.children.get(fileName)
  if (existing) {
    // A file sharing the name of a directory: it becomes the layout for the
    // directory's path segment.
    if (existing.file && existing.file !== filePath) {
      throw new Error(
        `[unplugin-react-router] Duplicate layout file for segment "${fileName}": ` +
          `${existing.file} and ${filePath}`
      )
    }
    assertConfigUsable(config, filePath, 'layout')
    existing.file = filePath
    if (config) existing.fileConfig = config
    return
  }

  const child = parseFileSegment(fileName, filePath)
  child.parent = node
  child.file = filePath
  if (config) child.fileConfig = config
  node.children.set(fileName, child)
}

/**
 * Validate config placement after the whole tree is built (a node's final
 * role — leaf vs layout — is only known once every file is inserted).
 * Throws with a descriptive error when an override cannot apply.
 */
export function validateTreeConfig(root: TreeNode): void {
  if (root.indexFile && root.indexConfig) {
    assertConfigUsable(root.indexConfig, root.indexFile, 'index')
  }
  // An index route turns the node into a directory — a `path` override on its
  // layout file is invalid.
  if (
    root.file &&
    root.fileConfig &&
    (root.children.size > 0 || root.indexFile !== null)
  ) {
    assertConfigUsable(root.fileConfig, root.file, 'layout')
  }
  for (const child of root.children.values()) {
    if (child.kind === 'group' && child.file && child.indexFile) {
      throw new Error(
        `[unplugin-react-router] "${child.file}": route group "${child.rawSegment}" ` +
          'cannot combine a layout file with an `index` layout component — they both ' +
          'claim the pathless layout of the group. Keep `(name)/index.tsx` or a `layout.tsx` ' +
          'inside the group, not both.'
      )
    }
    validateTreeConfig(child)
  }
}

export function printTree(
  node: TreeNode,
  log: (...args: unknown[]) => void = console.log,
  indent = 0
): void {
  const label =
    node.file || node.indexFile
      ? `${node.rawSegment || '<root>'} (${node.pathSegment})` +
        (node.file ? ` [file]` : '') +
        (node.indexFile ? ` [index]` : '')
      : `${node.rawSegment || '<root>'} (${node.pathSegment || 'pathless'})`
  log('  '.repeat(indent) + label)
  for (const child of node.children.values()) {
    printTree(child, log, indent + 1)
  }
}
