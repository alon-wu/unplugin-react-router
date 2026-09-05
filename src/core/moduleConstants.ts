/** Virtual module identifiers (mirrors unplugin-vue-router conventions). */

/** Public, TS-friendly module id users import from. */
export const MODULE_ROUTES_PATH = 'unplugin-react-router/routes'

/** Vite requires virtual modules to start with \0. */
export const VIRTUAL_PREFIX = '\0'

export function asVirtualId(id: string): string {
  return VIRTUAL_PREFIX + id
}

export function getVirtualId(id: string): string | null {
  return id.startsWith(VIRTUAL_PREFIX)
    ? id.slice(VIRTUAL_PREFIX.length)
    : null
}
