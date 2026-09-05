import { createUnplugin } from 'unplugin'
import { resolveOptions, type Options } from './options'
import { createRoutesContext } from './core/context'
import {
  MODULE_ROUTES_PATH,
  asVirtualId,
  getVirtualId,
} from './core/moduleConstants'

export type { Options, RoutesFolder, RoutesFolderOption } from './options'
export { DEFAULT_OPTIONS } from './options'
export type { RoutesContext, ServerContext } from './core/context'
export { createRoutesContext } from './core/context'
export type { TreeNode, SegmentKind } from './core/tree'
export { MODULE_ROUTES_PATH } from './core/moduleConstants'

/**
 * Build-tool agnostic entry (works with rollup/rolldown builds). Most users
 * should import the Vite plugin from `unplugin-react-router/vite`.
 *
 * ```ts
 * // vite.config.ts
 * import reactRouter from 'unplugin-react-router/vite'
 *
 * export default defineConfig({
 *   plugins: [reactRouter()],
 * })
 * ```
 */
export default createUnplugin<Options | undefined>((opt = {}) => {
  const options = resolveOptions(opt)
  const ctx = createRoutesContext(options)

  return {
    name: 'unplugin-react-router',
    enforce: 'pre',

    resolveId(id: string) {
      // unplugin-react-router/routes -> \0unplugin-react-router/routes
      if (id === MODULE_ROUTES_PATH) {
        return asVirtualId(id)
      }
      return null
    },

    async buildStart() {
      await ctx.scanPages()
    },

    buildEnd() {
      ctx.stopWatcher()
    },

    load(id: string) {
      if (getVirtualId(id) === MODULE_ROUTES_PATH) {
        return ctx.getRoutes()
      }
      return null
    },
  }
})
