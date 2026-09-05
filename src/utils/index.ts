/** Shared small helpers. */

/** Transform an absolute path into a POSIX one so it can be used in import specifiers across OSes. */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Format a string as a TS string literal (double quoted, escaped). */
export function stringify(str: string): string {
  return JSON.stringify(str)
}

/** Indentation helper for generated code. */
export function pad(n: number, s = ''): string {
  return ' '.repeat(n) + s
}

export function warn(message: string): void {
  console.warn(`[unplugin-react-router] ${message}`)
}

/** Simple debounce that returns a cancelable promise. */
export function throttle(fn: () => void, wait = 100): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, wait)
  }
}

/** Sort extensions by length descending so `index.page.tsx` style suffixes match first. */
export function sortExtensions(extensions: string[]): string[] {
  return [...new Set(extensions)].sort((a, b) => b.length - a.length)
}
