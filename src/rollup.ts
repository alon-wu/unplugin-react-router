import { default as unpluginFactory } from './index'

/**
 * Rollup adapter of the unplugin factory (rolldown compatible).
 *
 * ```ts
 * // rollup.config.js
 * import reactRouter from 'unplugin-react-router/rollup'
 *
 * export default {
 *   plugins: [reactRouter({ ...options })],
 * }
 * ```
 */
export default unpluginFactory.rollup
export type { Options, RoutesFolder, RoutesFolderOption } from './options'
