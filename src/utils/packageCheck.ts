import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Check whether a package is installed, starting from a base directory and
 * walking up the file tree (like `local-pkg`'s `isPackageExists`, without the
 * dependency). Used to decide whether to generate `.d.ts` files.
 */
export function isPackageExists(
  name: string,
  baseDir = process.cwd()
): boolean {
  let dir = baseDir
  for (;;) {
    const pkgJson = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(pkgJson)) return true
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fallback: try resolving through the current module's node_modules chain.
  try {
    const resolved = import.meta.resolve?.(name)
    if (resolved) {
      const url = new URL(resolved)
      if (url.protocol === 'file:') return existsSync(url.pathname)
    }
  } catch {
    // ignore
  }
  return false
}

export function resolvePackagePath(name: string): string | undefined {
  try {
    const resolved = import.meta.resolve?.(name)
    if (resolved) {
      return pathToFileURL(resolved).pathname
    }
  } catch {
    // ignore
  }
  return undefined
}
