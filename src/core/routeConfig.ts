/**
 * Build-time extraction of per-file route configuration.
 *
 * A page module may declare route-level overrides that cannot be provided at
 * runtime (React Router forbids `lazy` from changing static route fields like
 * `path` or `caseSensitive`). We therefore read them **at build time** from a
 * top-level literal export:
 *
 * ```tsx
 * // src/pages/users/[id].tsx
 * export const route = {
 *   path: '/member/:id',   // override the URL derived from the file name
 *   caseSensitive: true,
 *   handle: { crumb: 'User' },
 * } as const satisfies import('unplugin-react-router/routes').RouteConfig
 * ```
 *
 * Constraints (validated here):
 * - the export must be a plain **object literal** whose values are literals
 *   (string / number / boolean / null / nested arrays & objects). No
 *   identifiers, function calls, template strings or spread — anything
 *   computed cannot be extracted statically and is rejected with a clear
 *   error pointing at the file;
 * - only one `export const route` per file;
 * - unknown keys are rejected (typos are hard errors, not silent no-ops).
 *
 * The scanner skips string literals, template literals and comments, so
 * occurrences inside component code or prose never match.
 */

export interface PageRouteConfig {
  /** Override the URL segment derived from the file name (leaf pages only). */
  path?: string
  /** Make the route case sensitive. */
  caseSensitive?: boolean
  /** Static `handle` merged onto the generated route record. */
  handle?: unknown
}

/**
 * Whether a config's `path` is absolute (starts with `/`). An absolute path
 * cannot be expressed as a nested React Router child record, so such leaves
 * are promoted to top-level routes during code generation.
 */
export function hasAbsolutePath(config: PageRouteConfig | undefined): boolean {
  return config?.path?.startsWith('/') ?? false
}

/** Extract `:param` keys (and a trailing splat) from an absolute path. */
export function paramKeysOfPath(path: string): string[] {
  const keys: string[] = []
  for (const segment of path.split('/')) {
    if (segment.startsWith(':')) keys.push(segment.slice(1))
    else if (segment === '*') keys.push('*')
  }
  return keys
}

const ALLOWED_KEYS = ['path', 'caseSensitive', 'handle'] as const

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch)
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** Minimal "JSON-ish" string unescaping (double or single quoted). */
function unquote(raw: string): string {
  // raw includes the quotes
  const quote = raw[0]
  const body = raw.slice(1, -1)
  let out = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = body[++i]
    switch (next) {
      case 'n': out += '\n'; break
      case 't': out += '\t'; break
      case 'r': out += '\r'; break
      case 'b': out += '\b'; break
      case 'f': out += '\f'; break
      case 'v': out += '\v'; break
      case '0': out += '\0'; break
      case 'u': {
        const hex = body.slice(i + 1, i + 5)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 4
        } else {
          out += next
        }
        break
      }
      case 'x': {
        const hex = body.slice(i + 1, i + 3)
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16))
          i += 2
        } else {
          out += next
        }
        break
      }
      default:
        // \\, \', \", \/, \` …
        out += next
    }
  }
  void quote
  return out
}

class RouteConfigParseError extends Error {
  constructor(filePath: string, message: string) {
    super(`[unplugin-react-router] "${filePath}": ${message}`)
    this.name = 'RouteConfigParseError'
  }
}

/** Skip whitespace, comments and collect the next "meaningful" region. */
class SourceScanner {
  i = 0
  constructor(
    readonly source: string,
    private readonly filePath: string
  ) {}

  get index(): number {
    return this.i
  }

  done(): boolean {
    return this.i >= this.source.length
  }

  /** Skip whitespace and comments. */
  skipWsAndComments(): void {
    const s = this.source
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++
      if (s[this.i] === '/' && s[this.i + 1] === '/') {
        while (this.i < s.length && s[this.i] !== '\n') this.i++
        continue
      }
      if (s[this.i] === '/' && s[this.i + 1] === '*') {
        this.i += 2
        while (this.i < s.length && !(s[this.i] === '*' && s[this.i + 1] === '/')) {
          this.i++
        }
        this.i = Math.min(s.length, this.i + 2)
        continue
      }
      return
    }
  }

  /** Skip a string ('…', "…" or `…`). Must be positioned on the opener. */
  skipString(): void {
    const s = this.source
    const quote = s[this.i]
    this.i++
    if (quote === '`') {
      // Template literal: skip until the matching backtick, tolerating
      // `${…}` (nested backticks inside expressions are not supported for
      // extraction anyway, and can only appear in *skipped* code).
      while (this.i < s.length) {
        if (s[this.i] === '\\') {
          this.i += 2
          continue
        }
        if (s[this.i] === '`') {
          this.i++
          return
        }
        this.i++
      }
      return
    }
    while (this.i < s.length) {
      if (s[this.i] === '\\') {
        this.i += 2
        continue
      }
      if (s[this.i] === quote) {
        this.i++
        return
      }
      this.i++
    }
  }

  /** Read a whole identifier-ish word. Positioned on its first char. */
  readWord(): string {
    const start = this.i
    while (this.i < this.source.length && isWordChar(this.source[this.i])) {
      this.i++
    }
    return this.source.slice(start, this.i)
  }

  fail(message: string): never {
    throw new RouteConfigParseError(this.filePath, message)
  }
}

/**
 * Parse one value (recursive). Only JSON-compatible literals are allowed:
 * object, array, string, number, boolean, null.
 */
function parseValue(
  sc: SourceScanner,
  filePath: string,
  depth: number
): unknown {
  if (depth > 40) {
    throw new RouteConfigParseError(
      filePath,
      'route config is nested too deeply (max 40 levels).'
    )
  }
  sc.skipWsAndComments()
  if (sc.done()) {
    throw new RouteConfigParseError(filePath, 'unexpected end of file inside route config.')
  }
  const ch = sc.source[sc.index]

  if (ch === '{') return parseObjectValue(sc, filePath, depth)
  if (ch === '[') return parseArrayValue(sc, filePath, depth)
  if (ch === '"' || ch === "'") {
    const start = sc.index
    sc.skipString()
    return unquote(sc.source.slice(start, sc.index))
  }
  if (ch === '-' || isDigit(ch)) {
    const start = sc.index
    const s = sc.source
    if (s[sc.index] === '-') sc.i++
    while (sc.i < s.length && /[\d.eE+-]/.test(s[sc.i])) sc.i++
    const text = s.slice(start, sc.index)
    if (text === '-' || !isFinite(Number(text))) {
      throw new RouteConfigParseError(
        filePath,
        `invalid number literal "${text}" in route config.`
      )
    }
    return Number(text)
  }
  if (isWordChar(ch)) {
    const word = sc.readWord()
    if (word === 'true') return true
    if (word === 'false') return false
    if (word === 'null') return null
    throw new RouteConfigParseError(
      filePath,
      `unsupported expression "${word}" in route config. ` +
        'Only literal values are supported (strings, numbers, booleans, null, ' +
        'arrays and objects); move computed values into your loader/handle ' +
        'or inline them as literals.'
    )
  }
  throw new RouteConfigParseError(
    filePath,
    `unexpected character "${ch}" in route config (only literal values are supported).`
  )
}

function parseArrayValue(
  sc: SourceScanner,
  filePath: string,
  depth: number
): unknown[] {
  sc.i++ // consume '['
  const out: unknown[] = []
  for (;;) {
    sc.skipWsAndComments()
    if (sc.done()) {
      throw new RouteConfigParseError(filePath, 'unterminated array in route config.')
    }
    if (sc.source[sc.index] === ']') {
      sc.i++
      return out
    }
    out.push(parseValue(sc, filePath, depth + 1))
    sc.skipWsAndComments()
    const c = sc.source[sc.index]
    if (c === ',') {
      sc.i++
      continue
    }
    if (c === ']') {
      sc.i++
      return out
    }
    throw new RouteConfigParseError(
      filePath,
      'expected "," or "]" in route config array.'
    )
  }
}

function parseKey(sc: SourceScanner, filePath: string): string {
  sc.skipWsAndComments()
  const ch = sc.source[sc.index]
  if (ch === '"' || ch === "'") {
    const start = sc.index
    sc.skipString()
    return unquote(sc.source.slice(start, sc.index))
  }
  if (isWordChar(ch)) return sc.readWord()
  if (ch === '}') return ''
  throw new RouteConfigParseError(filePath, 'invalid key in route config object.')
}

function parseObjectValue(
  sc: SourceScanner,
  filePath: string,
  depth: number
): Record<string, unknown> {
  sc.i++ // consume '{'
  const out: Record<string, unknown> = {}
  for (;;) {
    sc.skipWsAndComments()
    if (sc.done()) {
      throw new RouteConfigParseError(filePath, 'unterminated object in route config.')
    }
    if (sc.source[sc.index] === '}') {
      sc.i++
      return out
    }
    const key = parseKey(sc, filePath)
    if (key === '') {
      throw new RouteConfigParseError(filePath, 'invalid key in route config object.')
    }
    sc.skipWsAndComments()
    if (sc.source[sc.index] !== ':') {
      throw new RouteConfigParseError(
        filePath,
        `expected ":" after key "${key}" in route config.`
      )
    }
    sc.i++
    const value = parseValue(sc, filePath, depth + 1)
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new RouteConfigParseError(
        filePath,
        `duplicate key "${key}" in route config.`
      )
    }
    out[key] = value
    sc.skipWsAndComments()
    const c = sc.source[sc.index]
    if (c === ',') {
      sc.i++
      continue
    }
    if (c === '}') {
      sc.i++
      return out
    }
    throw new RouteConfigParseError(
      filePath,
      `expected "," or "}" after key "${key}" in route config.`
    )
  }
}

/**
 * Extract the route config of a page module. Returns `undefined` when the
 * module does not export a `route` config.
 */
export function extractRouteConfig(
  source: string,
  filePath: string
): PageRouteConfig | undefined {
  const sc = new SourceScanner(source, filePath)
  let found = false
  let result: PageRouteConfig = {}

  // Track the two previous identifiers so we can recognise `export const route`
  // as a whole-word sequence and ignore `const route`, `export default …`,
  // comments, strings etc.
  const prev: Array<{ word: string; index: number }> = []
  let lastPunctEnd = -1 // index right after the last ';'

  while (!sc.done()) {
    sc.skipWsAndComments()
    if (sc.done()) break
    const s = sc.source
    const ch = s[sc.index]

    if (ch === '"' || ch === "'" || ch === '`') {
      sc.skipString()
      continue
    }
    if (isWordChar(ch)) {
      const start = sc.index
      const word = sc.readWord()
      if (
        word === 'route' &&
        prev.length >= 2 &&
        prev[prev.length - 1].word === 'const' &&
        prev[prev.length - 2].word === 'export' &&
        prev[prev.length - 1].index > lastPunctEnd
      ) {
        // export const route = { … }
        sc.skipWsAndComments()
        if (s[sc.index] === '=') {
          sc.i++
          sc.skipWsAndComments()
          if (s[sc.index] === '{') {
            const value = parseObjectValue(sc, filePath, 0)
            if (found) {
              throw new RouteConfigParseError(
                filePath,
                'duplicate `export const route` — only one route config per file is allowed.'
              )
            }
            found = true
            result = validateConfig(value, filePath)
            // skip the rest of this statement (e.g. `as const`/`satisfies …`)
            // up to the next ';' or end of line — the main loop is safe after
            // that because further identifiers cannot re-match "export const
            // route" accidentally.
            while (!sc.done() && s[sc.index] !== ';' && s[sc.index] !== '\n') {
              if (s[sc.index] === '"' || s[sc.index] === "'" || s[sc.index] === '`') {
                sc.skipString()
              } else {
                sc.i++
              }
            }
            if (s[sc.index] === ';') sc.i++
            lastPunctEnd = sc.index
            continue
          }
          throw new RouteConfigParseError(
            filePath,
            '`export const route` must be an object literal: { path?, caseSensitive?, handle? }.'
          )
        }
      }
      prev.push({ word, index: start })
      if (prev.length > 2) prev.shift()
      continue
    }
    if (ch === ';') {
      lastPunctEnd = sc.index + 1
    }
    sc.i++
  }

  return found ? result : undefined
}

function validateConfig(
  value: Record<string, unknown>,
  filePath: string
): PageRouteConfig {
  for (const key of Object.keys(value)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw new RouteConfigParseError(
        filePath,
        `unknown key "${key}" in route config. Allowed keys: ` +
          ALLOWED_KEYS.map((k) => `"${k}"`).join(', ') +
          '.'
      )
    }
  }
  const rawPath = value.path
  if (rawPath !== undefined) {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new RouteConfigParseError(
        filePath,
        'route config "path" must be a non-empty string.'
      )
    }
  }
  const rawCase = value.caseSensitive
  if (rawCase !== undefined && typeof rawCase !== 'boolean') {
    throw new RouteConfigParseError(
      filePath,
      'route config "caseSensitive" must be a boolean.'
    )
  }
  const config: PageRouteConfig = {}
  if (rawPath !== undefined) config.path = rawPath
  if (rawCase !== undefined) config.caseSensitive = rawCase
  if (value.handle !== undefined) config.handle = value.handle
  return config
}
