import { default as unpluginFactory } from './index'

/**
 * esbuild adapter of the unplugin factory.
 *
 * ```ts
 * // esbuild.config.js
 * import reactRouter from 'unplugin-react-router/esbuild'
 *
 * build({
 *   plugins: [reactRouter({ ...options })],
 * })
 * ```
 */
export default unpluginFactory.esbuild
export type { Options, RoutesFolder, RoutesFolderOption } from './options'
