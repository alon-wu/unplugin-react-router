import { createUnplugin } from 'unplugin'
import { resolveOptions, type Options } from './options.ts'
import { createRoutesContext } from './core/context.ts'
import {
  MODULE_ROUTES_PATH,
  asVirtualId,
  getVirtualId,
} from './core/moduleConstants.ts'

export type { Options, RoutesFolder, RoutesFolderOption } from './options.ts'
export { DEFAULT_OPTIONS } from './options.ts'
export type { RoutesContext, ServerContext } from './core/context.ts'
export { createRoutesContext } from './core/context.ts'
export type { TreeNode, SegmentKind, TreeOptions } from './core/tree.ts'
export { MODULE_ROUTES_PATH } from './core/moduleConstants.ts'
export type { PageRouteConfig } from './core/routeConfig.ts'

/**
 * Build-tool agnostic entry. The factory instance exposes per-bundler
 * adapters — use the dedicated subpath for clarity:
 *
 * ```ts
 * import reactRouter from 'unplugin-react-router/vite'      // Vite
 * import reactRouter from 'unplugin-react-router/webpack'    // Webpack
 * import reactRouter from 'unplugin-react-router/rollup'     // Rollup
 * import reactRouter from 'unplugin-react-router/esbuild'    // esbuild
 * ```
 *
 * The root export is the raw `createUnplugin` instance:
 * `reactRouter.webpack(options)`, `reactRouter.rollup(options)`, …
 *
 * Rollup/rolldown watch mode works out of the box: every rebuild re-runs the
 * plugin hooks (a fresh `scanPages()`), so adding/removing page files is
 * picked up by the bundler's own watch pipeline.
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

    load(id: string) {
      if (getVirtualId(id) === MODULE_ROUTES_PATH) {
        return ctx.getRoutes()
      }
      return null
    },
  }
})
