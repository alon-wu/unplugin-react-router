import type { TreeNode } from '../core/tree.ts'
import { hasAbsolutePath, paramKeysOfPath } from '../core/routeConfig.ts'

/**
 * Flat view of every URL the generated tree can match, used to produce the
 * typed surface (`AppRoutePath`, `AppRouteParams`). Independent from the
 * code generator so the route records and the types cannot drift apart.
 */

export interface CollectedRoute {
  /** Absolute URL path in React Router syntax (`/`, `/users/:id`, `/docs/*`…). */
  fullPath: string
  /** Parameter keys of this path. A splat contributes `'*'`. */
  paramKeys: string[]
}

function joinUrl(segments: string[]): string {
  return segments.length > 0 ? '/' + segments.join('/') : '/'
}

/**
 * Collect the URLs of every matcheable route of the tree (root index, index
 * children, leaf files, layout files, splats — but not pathless groups or
 * pathless wrappers, which add no URL). Leaves promoted by an absolute `path`
 * override contribute exactly that path (deduped like everything else).
 */
export function collectRoutes(root: TreeNode): CollectedRoute[] {
  const out = new Map<string, CollectedRoute>()

  const push = (fullPath: string, paramKeys: string[]): void => {
    if (!out.has(fullPath)) {
      out.set(fullPath, { fullPath, paramKeys })
    }
  }

  const walk = (
    node: TreeNode,
    parentSegments: string[],
    parentParams: string[]
  ): void => {
    const isGroup = node.kind === 'group'
    const ownSegment =
      isGroup ? '' : node.pathSegment === '' ? node.rawSegment : node.pathSegment
    const ownParam =
      isGroup || ownSegment === ''
        ? null
        : node.kind === 'splat'
          ? '*'
          : node.pathSegment.startsWith(':')
            ? node.pathSegment.slice(1)
            : null

    const prefixSegments = isGroup ? parentSegments : ownSegment === '' ? parentSegments : [...parentSegments, ownSegment]
    const prefixParams = ownParam ? [...parentParams, ownParam] : parentParams

    // index file → default route of this node's URL.
    if (node.indexFile) push(joinUrl(prefixSegments), prefixParams)

    // layout/leaf/splat file also matches its own URL — except leaves
    // promoted to a top-level absolute path override.
    if (node.file && !isGroup) {
      const absPath = hasAbsolutePath(node.fileConfig) ? node.fileConfig!.path! : null
      if (absPath !== null) {
        push(absPath, paramKeysOfPath(absPath))
      } else {
        push(joinUrl(prefixSegments), prefixParams)
      }
    }

    for (const child of node.children.values()) {
      walk(child, prefixSegments, prefixParams)
    }
  }

  // Root: index → '/'; a root layout file (layout.tsx wrapper) adds no URL.
  if (root.indexFile) push('/', [])
  for (const child of root.children.values()) {
    walk(child, [], [])
  }

  const sorted = [...out.values()].sort((a, b) =>
    a.fullPath < b.fullPath ? -1 : a.fullPath > b.fullPath ? 1 : 0
  )
  return sorted
}
