> **English** · [简体中文](../zh/api.md)

# API reference

## Plugin factory (Vite entry — recommended)

```ts
import reactRouter from 'unplugin-react-router/vite'

reactRouter(options?: Options): VitePlugin
```

The generic `unplugin` factory is the default export of the package root, and
each bundler has its own dedicated subpath:

```ts
import reactRouter from 'unplugin-react-router'          // createUnplugin instance
import reactRouter from 'unplugin-react-router/webpack'   // Webpack adapter (direct)
import reactRouter from 'unplugin-react-router/rollup'    // Rollup / Rolldown
import reactRouter from 'unplugin-react-router/esbuild'   // esbuild
// reactRouter.vite(options) / reactRouter.webpack(options) / …
```

Watch mode for Rollup/rolldown/Webpack is driven by the bundler itself: every
rebuild re-runs the plugin’s `buildStart` (i.e. a fresh scan), so page-file
additions/removals take effect on watch rebuilds. The Vite dev server, in
contrast, needs event-driven updates (see the `watch` option).

## `Options`

All options are optional.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `routesFolder` | `string \| RoutesFolderOption \| Array<string \| RoutesFolderOption>` | `'src/pages'` | Folder(s) scanned for page files (glob patterns are **not** supported; use `exclude`/`extensions`/`filePatterns` to filter) |
| `extensions` | `string[]` | `['.tsx', '.jsx']` | Suffixes treated as page files. Must be dot-prefixed and non-empty. Longest match wins. |
| `exclude` | `string[]` | `[]` | picomatch globs relative to each scanned folder (e.g. `['**/ignored/**']`) |
| `layoutFile` | `string \| false` | `false` | The layout special-file name (no extension, e.g. `'layout'`). When enabled, `layout.tsx` becomes the layout component of its directory’s path segment; at the root of a routes folder it becomes a pathless layout wrapping every route. The name is reserved while enabled (cannot be a plain page). |
| `dotNesting` | `boolean` | `false` | Expand dots in file names into nested static path segments (`users.create.tsx` → `/users/create`, no UI nesting). When off, dots are literal characters (`a.b.tsx` → `/a.b`). |
| `root` | `string` | `process.cwd()` | Project root; all relative paths resolve against it |
| `dts` | `boolean \| string` | auto | Generate the ambient declaration for the virtual module (including the `AppRoutePath`/`RouteParams` type surface). `false` disables; a string is the output path (relative to `root`). Defaults on when `typescript` can be resolved. |
| `logs` | `boolean` | `false` | Debug output (scan tree, file writes) |
| `watch` | `boolean \| 'polling'` | `!process.env.CI` | How dev-time page additions/removals are detected: `true` hooks into the bundler/dev-server file watcher (falls back to polling when none is available); `'polling'` forces the polling scanner (for setups where bundler watcher events are unreliable, e.g. some Vite 8/Rolldown environments); `false` disables it entirely (structural changes need a dev-server restart). |
| `_inspect` | `boolean` | `false` | @internal — reserved for `vite-plugin-inspect` compatibility (no `\0` prefix) |

## `RoutesFolderOption`

Used inside `routesFolder` arrays (or alone).

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | — | Folder to scan (**required**). Not a glob. |
| `path` | `string` | `''` | Static (or `[param]`) path prefix added to every route of this folder. May contain `/`. Must not start with `/`. Trailing slashes are trimmed. |
| `extensions` | `string[] \| (existing) => string[]` | global | Per-folder override / extension of the global list |
| `exclude` | `string[] \| (existing) => string[]` | global | Per-folder override / extension of the global list |
| `filePatterns` | `string[] \| (existing) => string[]` | none | Per-folder **positive** glob filter (relative paths from that folder’s `src`, including the extension). When given, only files matching any of its patterns are page files; an empty array is an error (nothing would match). |

### Examples

```ts
reactRouter({
  routesFolder: [
    'src/pages',
    {
      src: 'src/admin/pages',
      path: 'admin',
      exclude: ['**/hidden/**'],
      filePatterns: ['**/*.page.tsx'],   // only .page.tsx files are pages
    },
    // parameterised prefix: every route of this folder becomes /docs/:lang/…
    // (the [lang] segment is parsed like a directory segment)
    { src: 'src/i18n', path: 'docs/[lang]' },
  ],
})
```

> Prefixes create component-less parent records: children render through them,
> they are **not** layouts. Combine a folder prefix with an `index.tsx` if you
> need a layout at the prefixed path.

## Virtual module `unplugin-react-router/routes`

```ts
import { routes } from 'unplugin-react-router/routes'
import routesDefault from 'unplugin-react-router/routes'

// both are RouteObject[]
```

- Id without prefix: `unplugin-react-router/routes`.
- Internally resolved to `\0unplugin-react-router/routes` (Vite virtual module).
- The generated source is plain JS on purpose (the module id has no extension,
  so bundlers parse it as JS; TS-only syntax would fail).
- Types come from the ambient declaration the plugin writes (see next section).

Runtime shape of the module:

```js
export const routes = [ /* RouteObject literals */ ]
export default routes
```

There is deliberately **no runtime dependency**: the module only contains the
route table and dynamic `import()`s of your page files. `react-router` is only
imported as a type by the ambient declaration.

## Generated files

### `typed-routes.d.ts` (project root by default)

```ts
/* eslint-disable */
/* prettier-ignore */
// @ts-nocheck
// Generated by unplugin-react-router. DO NOT MODIFY THIS FILE.
// Add this file to your tsconfig "include"/"files" entry if it is not picked
// up automatically (default tsconfigs often include every `*.d.ts` under root).

declare module 'unplugin-react-router/routes' {
  import type { RouteObject } from 'react-router'

  export const routes: RouteObject[]
  export default routes

  // ---- generated typed surface (from src/pages) ----
  export type AppRoutePath =
    | "/"
    | "/about"
    | "/users/:id"
    | "/*"

  export interface AppRouteParams {
    "/": Record<string, never>
    "/users/:id": { "id": string }
  }

  export type RouteParams<P extends AppRoutePath> = P extends keyof AppRouteParams
    ? AppRouteParams[P]
    : Record<string, never>

  export interface RouteConfig {
    path?: string
    caseSensitive?: boolean
    handle?: unknown
  }

  export type LoaderData<T extends (...args: never[]) => unknown> = Awaited<
    ReturnType<T>
  >
}
```

Written when the content changes, during `buildStart` and after every rescan.
Disabled via `dts: false`, relocated via `dts: 'src/ambient.d.ts'`. If your
`tsconfig` does not automatically include `*.d.ts` files under the project
root, add it to `include`.

## Package exports

```jsonc
{
  "exports": {
    ".":         { "types": "./dist/index.d.ts",    "import": "./dist/index.js",    "require": "./dist/index.cjs" },
    "./vite":    { "types": "./dist/vite.d.ts",     "import": "./dist/vite.js",     "require": "./dist/vite.cjs" },
    "./webpack": { "types": "./dist/webpack.d.ts",  "import": "./dist/webpack.js",  "require": "./dist/webpack.cjs" },
    "./rollup":  { "types": "./dist/rollup.d.ts",   "import": "./dist/rollup.js",   "require": "./dist/rollup.cjs" },
    "./esbuild": { "types": "./dist/esbuild.d.ts",  "import": "./dist/esbuild.js",  "require": "./dist/esbuild.cjs" },
    "./package.json": "./package.json"
  },
  "peerDependencies": {
    "react-router": "^8.0.0",
    "vite": "^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0" // optional
  }
}
```

## Public TypeScript types

Imported from the package root (types only, no runtime cost):

```ts
import type {
  Options,
  RoutesFolder,
  RoutesFolderOption,
  RoutesContext,
  ServerContext,
  TreeNode,
  SegmentKind,
  TreeOptions,
  PageRouteConfig,
} from 'unplugin-react-router'
```

| Type | Where | Description |
| --- | --- | --- |
| `Options` / `RoutesFolder` / `RoutesFolderOption` | `src/options.ts` | user options (above) |
| `RoutesContext` | `src/core/context.ts` | plugin context API (`scanPages`, `getRoutes`, `getRoot`, `setServerContext`) — for embedding in custom tooling |
| `ServerContext` | `src/core/context.ts` | minimal server contract (`invalidateRoutes`, `reload`) |
| `TreeNode` / `SegmentKind` / `TreeOptions` | `src/core/tree.ts` | the route tree node model and the optional convention switches |
| `PageRouteConfig` | `src/core/routeConfig.ts` | the type of `export const route` |

## Errors

All errors are thrown during scan with a `[unplugin-react-router]` prefix and
the offending file path where relevant. Exact messages (fragments):

| Message (fragment) | Cause |
| --- | --- |
| `"extensions" cannot be empty.` | `extensions: []` |
| `Invalid extension "X".` | extension without leading `.` |
| `routesFolder "X" path prefix cannot start with "/".` | folder prefix begins with `/` |
| `"filePatterns" cannot be an empty array` | an empty array would make nothing match |
| `"layoutFile" must be a plain file name` | `layoutFile` contains an extension / invalid characters |
| `directories cannot be named "index".` | a directory literally named `index` |
| `splat segments … cannot be directories.` | directory named `[...x]` |
| `optional segments … cannot be directories.` | directory named `[[x]]` |
| `unsupported segment "X".` | `[id]+`, `prefix-[id]`, `[a][b]`, etc. cannot be expressed with React Router (including optional catch-all directories) |
| `segment "X" contains characters (:, *, ?)` | a static segment conflicts with React Router path syntax |
| `route groups must be directories` | a file named `(x)` |
| `a splat route ("[...x]") cannot contain children.` | files nested under a catch-all route |
| `Duplicate index file for "X"` | two indexes (including an optional param file coexisting with an explicit index) |
| `Duplicate layout file for segment "X"` | two files claiming the same layout (same-name file / `layout.tsx`) |
| `dot-nesting cannot express empty segments` | `a..b` |
| `dot-nesting only supports plain static names` | structural characters such as `(` `)` inside a dot name |
| `route group "X" cannot combine a layout file with an index layout` | `(x)/layout.tsx` coexisting with `(x)/index.tsx` |
| `route config "path" overrides are only supported on leaf page files` | a `path` override on index/layout/optional files |
| `route config "caseSensitive" cannot apply to an index route` / `is ambiguous on an optional segment file` | overrides with ambiguous semantics |
| `… only literal values are supported …` | `export const route` contains a computed expression |
| `… must be an object literal` / `unknown key "X"` / `duplicate key` / `duplicate \`export const route\`` | malformed `route` export |

Errors surface as:

- dev server / build failure with a Vite overlay (they are thrown from
  `buildStart` / rescan),
- test failures when exercising the tree rules.

> Any other unexpected scan error is reported through the logger callback when
> `logs: true`, otherwise it fails the build like above.
