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
 * - `[id]` segments become `:id`, `[...rest]` files become the `*` splat.
 */

export type SegmentKind = 'group' | 'static' | 'param' | 'splat'

export interface TreeNode {
  /** Raw segment name as found on disk (`''` for roots). */
  rawSegment: string
  kind: SegmentKind
  /** React Router path segment: `:id`, `*`, the raw static name or `''` for pathless nodes. */
  pathSegment: string
  /** Layout / leaf route module file for this segment (absolute path). */
  file: string | null
  /** `index` module file of this directory (absolute path). */
  indexFile: string | null
  /** Keyed by raw segment name. */
  children: Map<string, TreeNode>
  parent: TreeNode | null
}

export function createRootNode(): TreeNode {
  return {
    rawSegment: '',
    kind: 'static',
    pathSegment: '',
    file: null,
    indexFile: null,
    children: new Map(),
    parent: null,
  }
}

const PARAM_RE = /^\[([\w-]+)\]$/
const SPLAT_RE = /^\[\.\.\.([\w-]+)\]$/
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
    throw new Error(
      `[unplugin-react-router] "${filePath}": unsupported segment "${raw}". Only whole-segment ` +
        'params (`[id]`), whole-segment splats (`[...rest]`) and static names are supported. ' +
        'Optional (`[[id]]`), repeatable (`[id]+`) and partial (`prefix-[id]`) segments cannot be ' +
        'expressed with React Router path syntax.'
    )
  }
}

/**
 * Parse a directory segment name. `index` and splat names are invalid for
 * directories.
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
    return {
      rawSegment: raw,
      kind: 'group',
      pathSegment: '',
      file: null,
      indexFile: null,
      children: new Map(),
      parent: null,
    }
  }
  const splat = SPLAT_RE.exec(raw)
  if (splat) {
    throw new Error(
      `[unplugin-react-router] "${filePath}": splat segments ("${raw}") cannot be ` +
        'directories. Use a `[...rest].tsx` file inside a directory instead.'
    )
  }
  const param = PARAM_RE.exec(raw)
  if (param) {
    return {
      rawSegment: raw,
      kind: 'param',
      pathSegment: `:${param[1]}`,
      file: null,
      indexFile: null,
      children: new Map(),
      parent: null,
    }
  }
  assertSafeStaticName(raw, filePath)
  return {
    rawSegment: raw,
    kind: 'static',
    pathSegment: raw,
    file: null,
    indexFile: null,
    children: new Map(),
    parent: null,
  }
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
    return {
      rawSegment: raw,
      kind: 'splat',
      pathSegment: '*',
      file: null,
      indexFile: null,
      children: new Map(),
      parent: null,
    }
  }
  const param = PARAM_RE.exec(raw)
  if (param) {
    return {
      rawSegment: raw,
      kind: 'param',
      pathSegment: `:${param[1]}`,
      file: null,
      indexFile: null,
      children: new Map(),
      parent: null,
    }
  }
  assertSafeStaticName(raw, filePath)
  return {
    rawSegment: raw,
    kind: 'static',
    pathSegment: raw,
    file: null,
    indexFile: null,
    children: new Map(),
    parent: null,
  }
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

/**
 * Insert one page file into the tree. `dirSegments` are the directory raw
 * names between the folder root and the file, `fileName` is the file name
 * without extension, `filePath` is the absolute file path.
 */
export function addFileToTree(
  root: TreeNode,
  dirSegments: string[],
  fileName: string,
  filePath: string
): void {
  let node = root
  for (const seg of dirSegments) {
    node = ensureChild(node, seg, parseDirSegment, filePath)
  }

  if (fileName === 'index') {
    if (node.indexFile && node.indexFile !== filePath) {
      throw new Error(
        `[unplugin-react-router] Duplicate index file for "${node.rawSegment || '<root>'}": ` +
          `${node.indexFile} and ${filePath}`
      )
    }
    node.indexFile = filePath
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
    existing.file = filePath
    return
  }

  const child = parseFileSegment(fileName, filePath)
  child.parent = node
  child.file = filePath
  node.children.set(fileName, child)
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
