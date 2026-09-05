import type { Plugin, ViteDevServer } from 'vite'
import { resolveOptions, type Options } from './options.ts'
import { createRoutesContext } from './core/context.ts'
import {
  attachPageWatcher,
  createPollingScanner,
} from './core/watch.ts'
import {
  MODULE_ROUTES_PATH,
  asVirtualId,
  getVirtualId,
} from './core/moduleConstants.ts'

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
 *
 * Structural changes (adding/removing/renaming page files) are detected
 * through the dev-server file watcher (see `Options.watch` for the polling
 * fallback). The virtual routes module is invalidated and the page reloaded
 * so `createBrowserRouter(routes)` re-runs with the fresh table.
 */
export default function reactRouter(options: Options = {}): Plugin {
  const resolved = resolveOptions(options)
  const ctx = createRoutesContext(resolved)
  const logger = resolved.logs
    ? (message: string) => console.log('[unplugin-react-router]', message)
    : undefined

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

      const mode = resolved.watch
      if (mode === false) {
        // never watch: structural page changes need a dev-server restart
        return
      }

      const onChanged = () => ctx.scanPages()
      let detachWatcher: (() => void) | undefined
      let stopPolling: (() => void) | undefined

      if (mode === 'polling' || !server.watcher) {
        // forced polling, or no bundler watcher to tap
        const scanner = createPollingScanner({
          folders: resolved.routesFolder,
          onChanged,
          logger,
        })
        stopPolling = scanner.close
      } else {
        // primary path: bundler watcher add/unlink events
        const attached = attachPageWatcher({
          watcher: server.watcher,
          folders: resolved.routesFolder,
          onChanged,
          logger,
        })
        detachWatcher = attached.detach
      }

      const closeWatchers = () => {
        detachWatcher?.()
        detachWatcher = undefined
        stopPolling?.()
        stopPolling = undefined
      }
      server.httpServer?.once('close', closeWatchers)
      return closeWatchers
    },
  }
}
