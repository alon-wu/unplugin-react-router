import type { TreeNode } from '../core/tree.ts'
import { hasAbsolutePath } from '../core/routeConfig.ts'
import { stringify, toPosix } from '../utils/index.ts'

/**
 * Generate the code of the virtual routes module: an array of React Router
 * `RouteObject` literals. Each page module is lazy loaded and its exports are
 * forwarded to the route (`Component` explicitly from `default`, everything
 * else spread), which is robust whether React Router maps module `default`
 * exports itself or not.
 *
 * A leaf whose route config declares an **absolute** `path` (starting with
 * `/`) cannot be a nested child of its on-disk folder (React Router forbids
 * absolute child paths that do not match the parent chain), so it is promoted
 * to a top-level route; its on-disk ancestors produce no route when they
 * become empty.
 */

function indentBlock(block: string, prefix: string): string {
  return prefix + block.replace(/\n/g, '\n' + prefix)
}

/** Single-line lazy loader for a page module (absolute POSIX path). */
function genLazy(importPath: string): string {
  const spec = stringify(toPosix(importPath))
  return `async () => { const m = await import(${spec}); return { Component: m.default, ...m } }`
}

/**
 * Build the multi-line literal of one route object.
 * @param fields        `[key, valueLiteral]` pairs rendered in order.
 * @param childRecords  rendered children route literals (already formatted).
 * @param indent        absolute indentation of the `{`.
 */
function genObject(
  fields: Array<[string, string]>,
  childRecords: string[] | null,
  indent: number
): string {
  const lines: string[] = []
  lines.push(' '.repeat(indent) + '{')
  for (const [key, value] of fields) {
    lines.push(' '.repeat(indent + 2) + `${key}: ${value},`)
  }
  if (childRecords && childRecords.length) {
    lines.push(' '.repeat(indent + 2) + 'children: [')
    lines.push(
      childRecords
        .map((record) => indentBlock(record, ' '.repeat(indent + 4)))
        .join(',\n')
    )
    lines.push(' '.repeat(indent + 2) + '],')
  }
  lines.push(' '.repeat(indent) + '}')
  return lines.join('\n')
}

function lazyField(file: string): [string, string] {
  return ['lazy', genLazy(file)]
}

/** Extra fields coming from the file's `route` config, when present. */
function configFields(config: { caseSensitive?: boolean; handle?: unknown } | undefined): Array<[string, string]> {
  if (!config) return []
  const fields: Array<[string, string]> = []
  if (config.caseSensitive) fields.push(['caseSensitive', 'true'])
  if (config.handle !== undefined) {
    fields.push(['handle', JSON.stringify(config.handle)])
  }
  return fields
}

function configFieldsOf(node: TreeNode, via: 'index' | 'file'): Array<[string, string]> {
  return configFields(via === 'index' ? node.indexConfig : node.fileConfig)
}

/** The `path` value of a record: config override wins over the segment. */
function pathValue(node: TreeNode): string {
  if (node.fileConfig?.path !== undefined) return node.fileConfig.path
  return node.pathSegment
}

function pathField(node: TreeNode): [string, string] {
  return ['path', stringify(pathValue(node))]
}

/** True for a leaf promoted to a top-level route by its absolute path override. */
function isPromotedLeaf(node: TreeNode): boolean {
  return (
    node.kind !== 'group' &&
    node.file !== null &&
    node.children.size === 0 &&
    hasAbsolutePath(node.fileConfig)
  )
}

/** Collect every promoted (absolute override) leaf, sorted deterministically. */
function collectPromoted(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (node: TreeNode): void => {
    if (isPromotedLeaf(node)) out.push(node)
    for (const child of node.children.values()) walk(child)
  }
  for (const child of root.children.values()) walk(child)
  return out.sort((a, b) => {
    const ap = a.fileConfig!.path!
    const bp = b.fileConfig!.path!
    return ap < bp ? -1 : ap > bp ? 1 : 0
  })
}

/**
 * Records of the route *segments* directly under `parent` (its `children`),
 * e.g. `about`, `users/`, `(admin)/`. Promoted (absolute-override) leaves are
 * excluded — they are rendered at the top level. Sorted deterministically
 * with the splat last.
 */
function genChildRecords(parent: TreeNode, indent: number): string[] {
  const children = [...parent.children.values()].sort((a, b) => {
    const rank = (n: TreeNode) => (n.kind === 'splat' ? 1 : 0)
    return rank(a) - rank(b) || (a.rawSegment < b.rawSegment ? -1 : 1)
  })
  return children
    .map((child) => genNodeRecord(child, indent))
    .filter((record): record is string => record !== null)
}

/**
 * Generate a single route object literal for one tree node. Returns `null`
 * when the node should not produce a route (empty directory or a promoted
 * leaf).
 */
export function genNodeRecord(node: TreeNode, indent: number): string | null {
  // Promoted leaves are emitted at the top level by generateRouteRecords.
  if (isPromotedLeaf(node)) return null

  if (node.kind === 'group') {
    // pathless: either a layout (layout file or index component) or a
    // transparent grouping node without component
    const children = genChildRecords(node, indent + 2)
    if (children.length === 0 && !node.indexFile && !node.file) return null
    const fields: Array<[string, string]> = []
    if (node.file) {
      fields.push(...configFields(node.fileConfig))
      fields.push(lazyField(node.file))
    } else if (node.indexFile) {
      fields.push(...configFieldsOf(node, 'index'))
      fields.push(lazyField(node.indexFile))
    }
    return genObject(fields, children, indent)
  }

  if (node.kind === 'splat') {
    // splat files are always leaves (enforced by the tree)
    if (!node.file) return null
    const fields: Array<[string, string]> = [pathField(node)]
    fields.push(...configFields(node.fileConfig))
    fields.push(lazyField(node.file))
    return genObject(fields, null, indent)
  }

  // A node is a "directory record" when it has children OR an index child —
  // note an index route makes the node a directory even with zero segment
  // children (e.g. `blog.tsx` + `blog/index.tsx`).
  const isDirectory = node.children.size > 0 || node.indexFile !== null

  if (!isDirectory) {
    // a plain page file
    if (!node.file) return null
    const fields: Array<[string, string]> = [pathField(node)]
    fields.push(...configFields(node.fileConfig))
    fields.push(lazyField(node.file))
    return genObject(fields, null, indent)
  }

  const childRecords = genChildRecords(node, indent + 2)
  // When every child was promoted and there is no index/layout either, the
  // node produces no route (its on-disk path would otherwise be empty).
  if (!node.file && !node.indexFile && childRecords.length === 0) return null

  // directory: { path, layout?, children: [<index>?, ...records] }
  const fields: Array<[string, string]> = []
  fields.push(pathField(node))
  if (node.file) {
    fields.push(...configFields(node.fileConfig))
    fields.push(lazyField(node.file))
  }

  const records: string[] = []
  if (node.indexFile) {
    const indexFields: Array<[string, string]> = [['index', 'true']]
    indexFields.push(...configFieldsOf(node, 'index'))
    indexFields.push(lazyField(node.indexFile))
    records.push(genObject(indexFields, null, indent + 2))
  }
  records.push(...childRecords)
  return genObject(fields, records, indent)
}

/**
 * Route records for the whole tree root. The root's own `index` file becomes
 * a top-level `{ index: true }` route (matching `/`); a root layout file
 * (layout.tsx with `layoutFile` enabled) becomes a pathless wrapper around
 * every route; leaves with an absolute `path` override are promoted to
 * top-level routes (inside the wrapper when there is one).
 */
export function genTopLevelRecords(root: TreeNode, indent: number): string[] {
  const records: string[] = []
  let indexRecord: string | null = null
  if (root.indexFile) {
    const fields: Array<[string, string]> = [['index', 'true']]
    fields.push(...configFieldsOf(root, 'index'))
    fields.push(lazyField(root.indexFile))
    indexRecord = genObject(fields, null, indent + 2)
  }
  const childRecords = genChildRecords(root, indent)
  const promoted = collectPromoted(root).map((node) => {
    const fields: Array<[string, string]> = [pathField(node)]
    fields.push(...configFields(node.fileConfig))
    fields.push(lazyField(node.file!))
    return genObject(fields, null, indent + 2)
  })

  if (root.file) {
    // pathless root wrapper (root layout.tsx): every route — including the
    // root index and promoted absolute routes — renders inside its <Outlet/>.
    const inner: string[] = []
    if (indexRecord) inner.push(indexRecord)
    inner.push(...childRecords)
    inner.push(...promoted)
    const fields: Array<[string, string]> = []
    fields.push(...configFields(root.fileConfig))
    fields.push(lazyField(root.file))
    records.push(genObject(fields, inner, indent))
  } else {
    if (indexRecord) records.push(indexRecord)
    records.push(...childRecords)
    records.push(...promoted)
  }
  return records
}

/**
 * Full source code of the virtual routes module. Generated as plain
 * JavaScript on purpose: the module id has no extension so bundlers parse it
 * as JS (TS syntax such as `import type`/`satisfies` would fail). The module
 * types are provided by the ambient `.d.ts` generated next to the project
 * root (`typed-routes.d.ts`).
 */
export function generateRouteRecords(root: TreeNode): string {
  const records = genTopLevelRecords(root, 2)
  const inner =
    records.length > 0
      ? '\n' + records.map((r) => indentBlock(r, '  ')).join(',\n') + '\n'
      : ''
  return `export const routes = [${inner}]

export default routes
`
}
