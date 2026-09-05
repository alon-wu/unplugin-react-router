import { promises as fs } from 'node:fs'
import { isAbsolute, sep } from 'node:path'
import picomatch from 'picomatch'
import type { RoutesFolderOptionResolved } from '../options'

/** Path of a file relative to its folder in POSIX form. */
export function relToFolder(
  folder: RoutesFolderOptionResolved,
  abs: string
): string {
  const rel = abs.startsWith(folder.src)
    ? abs.slice(folder.src.length).replace(/^[\\/]+/, '')
    : abs
  return rel.replace(/\\/g, '/')
}

/** Find the folder a file belongs to (by path prefix). */
export function findFolder(
  folders: RoutesFolderOptionResolved[],
  abs: string
): RoutesFolderOptionResolved | undefined {
  return folders.find((folder) => {
    if (!isAbsolute(abs)) return false
    const base = folder.src.endsWith(sep) ? folder.src : folder.src + sep
    return abs.startsWith(base)
  })
}

export interface FolderMatcher {
  folder: RoutesFolderOptionResolved
  /** Whether the file name (basename with extension) matches one extension. */
  matchesExtension: (fileName: string) => boolean
  /**
   * Whether the file (relative POSIX path from the folder root, including its
   * extension) is a candidate page file: extension match AND positive
   * `filePatterns` match (when configured) AND not excluded.
   */
  matchesFile: (rel: string) => boolean
  isExcluded: (relFromFolder: string) => boolean
}

/** Create a matcher deciding whether a file (of a folder) is a page file. */
export function createFolderMatcher(
  folder: RoutesFolderOptionResolved
): FolderMatcher {
  const exts = folder.extensions
  const excluded = picomatch(folder.exclude)
  const patterns = folder.filePatterns ? picomatch(folder.filePatterns) : null
  return {
    folder,
    matchesExtension: (fileName: string) =>
      exts.some((ext) => fileName.endsWith(ext)),
    matchesFile: (rel: string) => {
      const fileName = rel.slice(rel.lastIndexOf('/') + 1)
      if (!exts.some((ext) => fileName.endsWith(ext))) return false
      if (patterns && !patterns(rel)) return false
      return !excluded(rel)
    },
    isExcluded: (rel: string) => excluded(rel),
  }
}

/**
 * Strip the longest matching extension of `folder` from `fileName`. Returns
 * the base name (e.g. `[id]`) or `null` when no extension matches.
 */
export function stripExtension(
  folder: RoutesFolderOptionResolved,
  fileName: string
): string | null {
  for (const ext of folder.extensions) {
    if (fileName.endsWith(ext) && fileName.length > ext.length) {
      return fileName.slice(0, -ext.length)
    }
  }
  return null
}

/**
 * True when `abs` is a page file (matching extension + filePatterns, not
 * excluded) of one of the watched folders.
 */
export function isPageFile(
  folders: RoutesFolderOptionResolved[],
  abs: string
): boolean {
  const folder = findFolder(folders, abs)
  if (!folder) return false
  const rel = relToFolder(folder, abs)
  return createFolderMatcher(folder).matchesFile(rel)
}

/** Minimal event-emitter interface of the file watchers we attach to. */
export interface WatcherLike {
  on: (event: string, listener: (...args: any[]) => void) => unknown
  off: (event: string, listener: (...args: any[]) => void) => unknown
}

/**
 * Attach page-file add/unlink handling to an existing file watcher (in Vite
 * this is `server.watcher`). Returns a `detach` function.
 */
export function attachPageWatcher(options: {
  watcher: WatcherLike
  folders: RoutesFolderOptionResolved[]
  onChanged: () => void | Promise<void>
  logger?: (message: string) => void
  /** debounce delay in ms, defaults to 80 */
  delay?: number
}): { detach: () => void } {
  const { watcher, folders, onChanged, logger, delay = 80 } = options

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      Promise.resolve(onChanged()).catch((error) => {
        logger?.(
          `Error while rescanning routes: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      })
    }, delay)
  }

  const handler = (event: string, filePath: string) => {
    if (event !== 'add' && event !== 'unlink') return
    if (isPageFile(folders, filePath)) {
      schedule()
    }
  }

  watcher.on('all', handler)

  return {
    detach: () => {
      if (timer) clearTimeout(timer)
      watcher.off('all', handler)
    },
  }
}

/** Recursively list page files (relative to their folder) of `folder`. */
async function collectPageRels(
  folder: RoutesFolderOptionResolved
): Promise<string[]> {
  const matcher = createFolderMatcher(folder)
  const rels: string[] = []
  const walk = async (dir: string): Promise<void> => {
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue
      const full = dir + sep + d.name
      if (d.isDirectory()) {
        await walk(full)
      } else if (d.isFile()) {
        const rel = relToFolder(folder, full)
        if (matcher.matchesFile(rel)) rels.push(rel)
      }
    }
  }
  await walk(folder.src)
  return rels
}

/**
 * Dev-only fallback that polls the routes folders for added/removed page
 * files, so route structure changes are detected even when the bundler
 * watcher cannot be reliably tapped (e.g. some Vite 8 / Rolldown setups).
 * Page folders are usually small, so a short interval is cheap.
 *
 * Enable with `watch: 'polling'`; it is also used automatically when no
 * bundler watcher is available.
 */
export function createPollingScanner(options: {
  folders: RoutesFolderOptionResolved[]
  onChanged: () => void | Promise<void>
  logger?: (message: string) => void
  /** polling interval in ms */
  interval?: number
}): { close: () => void } {
  const { folders, onChanged, logger, interval = 300 } = options

  let lastSignature = ''
  let timer: ReturnType<typeof setInterval> | undefined
  let running = true

  const tick = () => {
    if (!running) return
    Promise.all(folders.map(collectPageRels))
      .then((all) => [...all.flat()].sort().join('\n'))
      .then((sig) => {
        if (lastSignature === '') {
          lastSignature = sig
          return
        }
        if (sig !== lastSignature) {
          lastSignature = sig
          Promise.resolve(onChanged()).catch((error) => {
            logger?.(`Error while rescanning routes: ${String(error)}`)
          })
        }
      })
      .catch(() => {})
  }

  timer = setInterval(tick, interval)
  if (typeof timer.unref === 'function') timer.unref()

  return {
    close: () => {
      running = false
      if (timer) clearInterval(timer)
      timer = undefined
    },
  }
}
