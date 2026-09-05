import type { Plugin, ViteDevServer } from 'vite'
import { resolveOptions, type Options } from './options'
import { createRoutesContext } from './core/context'
import {
  MODULE_ROUTES_PATH,
  asVirtualId,
  getVirtualId,
} from './core/moduleConstants'

/**
 * Native Vite plugin for file based routing with React Router.
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
export default function reactRouter(options: Options = {}): Plugin {
  const resolved = resolveOptions(options)
  const ctx = createRoutesContext(resolved)

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

    configureServer(server: ViteDevServer) {
      ctx.setServerContext({
        invalidateRoutes() {
          const mod = server.moduleGraph.getModuleById(
            asVirtualId(MODULE_ROUTES_PATH)
          )
          // if the module was never loaded yet, the next request will go
          // through `load` anyway, so there is nothing to invalidate
          return mod ? server.reloadModule(mod) : false
        },
        reload() {
          server.ws.send({ type: 'full-reload' })
        },
      })

      // start polling for added/removed page files (dev only)
      ctx.startWatcher()
      const closeWatcher = () => {
        ctx.stopWatcher()
      }
      server.httpServer?.once('close', closeWatcher)
      return closeWatcher
    },
  }
}
