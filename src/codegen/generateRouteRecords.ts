import type { TreeNode } from '../core/tree.ts'
import { hasAbsolutePath, type PageRouteConfig } from '../core/routeConfig.ts'
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
 *
 * With a {@link LayoutContext} (the `layouts` option) every *top-level member*
 * (root index, top-level directory/leaf records, promoted routes) is grouped
 * into a pathless layout shell: members without a declared `layout` share the
 * default layout shell; members declaring `layout: 'admin'` are moved out of
 * the default shell into a sibling `admin` shell.
 */

/** Layout context used to wrap top-level members (v0.3 `layouts` option). */
export interface LayoutContext {
  /** Id of the default layout that wraps undeclared top-level members. */
  defaultId: string
  /** Resolved layout id → layout module file (absolute path). */
  layoutFiles: Map<string, string>
}

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

/** Deterministic sibling order (splat last). */
function sortedChildren(parent: TreeNode): TreeNode[] {
  return [...parent.children.values()].sort((a, b) => {
    const rank = (n: TreeNode) => (n.kind === 'splat' ? 1 : 0)
    return rank(a) - rank(b) || (a.rawSegment < b.rawSegment ? -1 : 1)
  })
}

/**
 * Records of the route *segments* directly under `parent` (its `children`),
 * e.g. `about`, `users/`, `(admin)/`. Promoted (absolute-override) leaves are
 * excluded — they are rendered at the top level. Sorted deterministically
 * with the splat last.
 */
function genChildRecords(parent: TreeNode, indent: number): string[] {
  return sortedChildren(parent)
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
 * Effective layout of a top-level subtree member. Layouts apply at top-level
 * member granularity: every page of the subtree must agree on one declared
 * layout (or none). Promoted (absolute-path) leaves are their own members and
 * are excluded here.
 */
function subtreeLayout(node: TreeNode, ctx: LayoutContext): string {
  let explicit: string | undefined
  let sawUndeclared = false

  const throwMix = (layout: string, file: string): never => {
    throw new Error(
      `[unplugin-react-router] top-level member "${node.file ?? node.indexFile ?? file}" ` +
        'mixes pages with and without a declared layout — the whole block must ' +
        `agree on one layout (undeclared pages use "${ctx.defaultId}", conflicting ` +
        `with "${layout}" from ${file}). Give every page of this block the same ` +
        'layout, or split it into separate top-level files / route groups.'
    )
  }

  const considerPage = (config: PageRouteConfig | undefined, file: string): void => {
    const layout = config?.layout
    if (layout === undefined) {
      if (explicit !== undefined) throwMix(explicit, file)
      sawUndeclared = true
      return
    }
    if (explicit === undefined) {
      if (sawUndeclared) throwMix(layout, file)
      explicit = layout
    } else if (explicit !== layout) {
      throwMix(layout, file)
    }
  }

  const walk = (n: TreeNode): void => {
    if (!isPromotedLeaf(n)) {
      if (n.file) considerPage(n.fileConfig, n.file)
      if (n.indexFile) considerPage(n.indexConfig, n.indexFile)
    }
    for (const child of n.children.values()) walk(child)
  }
  walk(node)

  return explicit ?? ctx.defaultId
}

/** Build the pathless layout-shell record wrapping `members`. */
function genShellRecord(layoutId: string, layoutFile: string, members: string[], indent: number): string {
  const fields: Array<[string, string]> = [lazyField(layoutFile)]
  return genObject(fields, members, indent)
}

/** Top-level members grouped by their effective layout (order-preserving). */
function groupedMembers(
  root: TreeNode,
  indent: number,
  ctx: LayoutContext
): { members: string[]; layoutOf: (index: number) => string } {
  // Collect (record, layout) pairs in stable order: root index, sorted child
  // records, promoted leaves.
  const records: string[] = []
  const layouts: string[] = []

  const push = (record: string | null, layout: string): void => {
    if (record === null) return
    records.push(record)
    layouts.push(layout)
  }

  if (root.indexFile) {
    const fields: Array<[string, string]> = [['index', 'true']]
    fields.push(...configFieldsOf(root, 'index'))
    fields.push(lazyField(root.indexFile))
    push(genObject(fields, null, indent + 2), root.indexConfig?.layout ?? ctx.defaultId)
  }

  for (const child of sortedChildren(root)) {
    const record = genNodeRecord(child, indent + 2)
    if (record !== null) {
      push(record, subtreeLayout(child, ctx))
    }
  }

  for (const leaf of collectPromoted(root)) {
    const fields: Array<[string, string]> = [pathField(leaf)]
    fields.push(...configFields(leaf.fileConfig))
    fields.push(lazyField(leaf.file!))
    push(genObject(fields, null, indent + 2), leaf.fileConfig?.layout ?? ctx.defaultId)
  }

  return {
    members: records,
    layoutOf: (index: number) => layouts[index],
  }
}

/**
 * Route records for the whole tree root with the `layouts` option enabled:
 * top-level members are wrapped by pathless layout shells. The default layout
 * shell comes first (when it has members), then the named layout shells in id
 * order.
 */
function genLayoutsRecords(root: TreeNode, indent: number, ctx: LayoutContext): string[] {
  if (root.file) {
    throw new Error(
      '[unplugin-react-router] a root layout file (layoutFile) cannot be combined ' +
        'with the "layouts" option. Use layouts.default as the global root shell ' +
        'and remove layoutFile / the root layout.tsx.'
    )
  }
  const { members, layoutOf } = groupedMembers(root, indent, ctx)
  const groups = new Map<string, string[]>()
  for (let i = 0; i < members.length; i++) {
    const layout = layoutOf(i)
    const list = groups.get(layout)
    if (list) list.push(members[i])
    else groups.set(layout, [members[i]])
  }

  const layoutOrder = [
    ctx.defaultId,
    ...[...groups.keys()].filter((id) => id !== ctx.defaultId).sort(),
  ]
  const shells: string[] = []
  for (const id of layoutOrder) {
    const list = groups.get(id)
    if (!list || list.length === 0) continue
    const layoutFile = ctx.layoutFiles.get(id)
    if (!layoutFile) {
      throw new Error(
        `[unplugin-react-router] layout "${id}" was declared by a page but no ` +
          'matching layout file was found in the layouts directory.'
      )
    }
    shells.push(genShellRecord(id, layoutFile, list, indent))
  }
  return shells
}

/**
 * Route records for the whole tree root. The root's own `index` file becomes
 * a top-level `{ index: true }` route (matching `/`); a root layout file
 * (layout.tsx with `layoutFile` enabled) becomes a pathless wrapper around
 * every route; leaves with an absolute `path` override are promoted to
 * top-level routes (inside the wrapper when there is one).
 *
 * When `ctx` is provided (the `layouts` option), top-level members are
 * grouped into pathless layout shells instead (see {@link genLayoutsRecords}).
 */
export function genTopLevelRecords(
  root: TreeNode,
  indent: number,
  ctx?: LayoutContext
): string[] {
  if (ctx) {
    return genLayoutsRecords(root, indent, ctx)
  }

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
export function generateRouteRecords(root: TreeNode, ctx?: LayoutContext): string {
  const records = genTopLevelRecords(root, 2, ctx)
  const inner =
    records.length > 0
      ? '\n' + records.map((r) => indentBlock(r, '  ')).join(',\n') + '\n'
      : ''
  return `export const routes = [${inner}]

export default routes
`
}
