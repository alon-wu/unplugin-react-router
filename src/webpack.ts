import { default as unpluginFactory } from './index'

/**
 * Webpack adapter of the unplugin factory.
 *
 * ```ts
 * // webpack.config.js
 * const reactRouter = require('unplugin-react-router/webpack')
 *
 * module.exports = {
 *   plugins: [reactRouter({ ...options })],
 * }
 * ```
 */
export default unpluginFactory.webpack
export type { Options, RoutesFolder, RoutesFolderOption } from './options'
