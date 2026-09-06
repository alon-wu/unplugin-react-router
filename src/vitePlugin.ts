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

  /** Watched folders = page folders (+ the layouts dir, when enabled). */
  const watchedFolders = () => {
    const folders = [...resolved.routesFolder]
    if (resolved.layouts) {
      folders.push({
        src: resolved.layouts.dir,
        path: '',
        extensions: [...resolved.layouts.extensions],
        exclude: [],
        filePatterns: null,
      })
    }
    return folders
  }

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
        logger?.('dev watcher disabled (watch: false)')
        return
      }

      const onChanged = () => ctx.scanPages()
      let detachWatcher: (() => void) | undefined
      let stopPolling: (() => void) | undefined

      if (mode === 'polling' || !server.watcher) {
        // forced polling, or no bundler watcher to tap
        logger?.('dev watcher: polling scanner')
        const scanner = createPollingScanner({
          folders: watchedFolders(),
          onChanged,
          logger,
        })
        stopPolling = scanner.close
      } else {
        // primary path: bundler watcher add/unlink events
        logger?.('dev watcher: dev-server file watcher')
        const attached = attachPageWatcher({
          watcher: server.watcher,
          folders: watchedFolders(),
          onChanged,
          logger,
        })
        detachWatcher = attached.detach
      }

      const closeWatchers = () => {
        logger?.('dev watcher closed')
        detachWatcher?.()
        detachWatcher = undefined
        stopPolling?.()
        stopPolling = undefined
      }
      // NOTE: do NOT return closeWatchers here. In Vite 8 (Rolldown) the
      // function returned from configureServer is invoked immediately after
      // configuration, which would stop the watcher before it starts. The
      // httpServer 'close' listener below is the reliable cleanup path.
      server.httpServer?.once('close', closeWatchers)
    },
  }
}
