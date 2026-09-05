import type { TreeNode } from '../core/tree'
import { stringify, toPosix } from '../utils'

/**
 * Generate the code of the virtual routes module: an array of React Router
 * `RouteObject` literals. Each page module is lazy loaded and its exports are
 * forwarded to the route (`Component` explicitly from `default`, everything
 * else spread), which is robust whether React Router maps module `default`
 * exports itself or not.
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

function pathField(node: TreeNode): [string, string] {
  return ['path', stringify(node.pathSegment)]
}

/**
 * Records of the route *segments* directly under `parent` (its `children`),
 * e.g. `about`, `users/`, `(admin)/`. Sorted deterministically with the
 * splat last.
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
 * when the node should not produce a route (empty directory).
 */
export function genNodeRecord(node: TreeNode, indent: number): string | null {
  if (node.kind === 'group') {
    // pathless: either a layout (with index component) or a transparent
    // grouping node without component
    const children = genChildRecords(node, indent + 2)
    if (children.length === 0 && !node.indexFile) return null
    const fields: Array<[string, string]> = []
    if (node.indexFile) fields.push(lazyField(node.indexFile))
    return genObject(fields, children, indent)
  }

  if (node.kind === 'splat') {
    // splat files are always leaves (enforced by the tree)
    if (!node.file) return null
    return genObject([pathField(node), lazyField(node.file)], null, indent)
  }

  const isDirectory = node.children.size > 0

  if (!isDirectory) {
    // a plain page file
    if (!node.file) return null
    return genObject([pathField(node), lazyField(node.file)], null, indent)
  }

  // directory: { path, layout?, children: [<index>?, ...records] }
  const fields: Array<[string, string]> = []
  fields.push(pathField(node))
  if (node.file) fields.push(lazyField(node.file))

  const childRecords = genChildRecords(node, indent + 2)
  const records: string[] = []
  if (node.indexFile) {
    records.push(
      genObject([['index', 'true'], lazyField(node.indexFile)], null, indent + 2)
    )
  }
  records.push(...childRecords)
  return genObject(fields, records, indent)
}

/**
 * Route records for the whole tree root. The root's own `index` file becomes
 * a top-level `{ index: true }` route (matching `/`).
 */
export function genTopLevelRecords(root: TreeNode, indent: number): string[] {
  const records: string[] = []
  if (root.indexFile) {
    records.push(
      genObject([['index', 'true'], lazyField(root.indexFile)], null, indent)
    )
  }
  const childRecords = genChildRecords(root, indent)
  records.push(...childRecords)
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
