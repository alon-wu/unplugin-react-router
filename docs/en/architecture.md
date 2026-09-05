> **English** · [简体中文](../zh/architecture.md)

# Architecture

This page explains how the plugin works internally, why it was designed this
way, how it compares with `unplugin-vue-router`, and what is known to be
limited or unfinished. **This page describes v0.2**; most items listed under
“known limitations / roadmap” in the v0.1 architecture document have landed in
v0.2 (see the status table at the end).

## Motivation and design goals

React Router v8 (data mode) is a great fit for file-based routing because a
route table is just a `RouteObject[]` fed to `createBrowserRouter`, and route
objects already support `lazy` loading of route modules. `unplugin-vue-router`
(uvr) proved the architecture for the Vue side:

| uvr building block | Can it be reused for React? | How |
| --- | --- | --- |
| Folder scan + route tree | ✅ yes | same tree model, different segment grammar output |
| `codegen` (tree → source text) | ✅ yes | we emit `RouteObject` literals instead of `RouteRecordRaw` |
| Virtual module (`vue-router/auto-routes`) | ✅ yes | `unplugin-react-router/routes` |
| Watcher + module invalidation | ✅ yes (mechanics) | dev-server watcher events + polling fallback |
| `definePage` / `<route>` block parsing | ⚠️ in another form | TSX module named exports + build-time extraction of `export const route` |
| Typed router | ⚠️ in another form | `AppRoutePath` / `RouteParams<P>` type surface (no named routes, see below) |
| `data-loaders` subsystem | ❌ not needed | `loader`/`action` are native to React Router |

**Target**: SPA data mode, Vite-first, plain `react-router`, no framework
runtime, route-module contract familiar from Remix, conventions close to uvr.

Comparison with the alternatives:

- **React Router Framework mode** (`@react-router/dev` + `fs-routes`): full
  framework (root route required, config files, bundler/server plugins). This
  plugin targets apps that want file routing without adopting the framework.
- **vite-plugin-react-router-fs** (community): scans a folder and *writes a
  physical* `routes.ts`. Different conventions (`layout.tsx`/`guard.tsx`
  special files). This plugin uses a virtual module and uvr-style conventions
  (with optional `layout.tsx`-style support).

## High-level data flow

```txt
pages/*.tsx ──scan──▶ route tree ──codegen──▶ TS/JS source ──virtual module──▶ app
    │                        │
    │ read source,           │
    │ extract route config   └──▶ typed-routes.d.ts (AppRoutePath / RouteParams…)
    ▼
  addFileToTree()  ◀── add/unlink (dev) or polling watch fallback
```

`scanPages()` (full, deterministic):

1. recursively collect the page files per folder (`extensions` + `exclude` +
   `filePatterns`);
2. per file, read the source and **extract the route config**
   (`export const route`, plain literal), insert it into the route tree
   together with the file-tree conventions (optional-param split, dot-nesting,
   `layout.tsx`);
3. once the tree is complete, run a **config placement validation** (a leaf’s
   vs a layout’s final role is only known at this point);
4. on structural change, invalidate the virtual module and do a full reload;
   rewrite `typed-routes.d.ts`.

`getRoutes()` (the virtual module's `load`) is lazy: it serialises the current
tree only when the module is requested, so a scan is cheap and the module is
always fresh after invalidation.

## Module map

```txt
src/
├── index.ts                unplugin factory entry (generic bundlers)
├── vite.ts / vitePlugin.ts native Vite plugin (watcher wiring + polling fallback)
├── webpack.ts / rollup.ts / esbuild.ts   subpath adapter entries
├── options.ts              Options / RoutesFolderOption, defaults, resolution
├── codegen/
│   ├── generateRouteRecords.ts   tree → virtual module source (pure function)
│   ├── generateDTS.ts            content of typed-routes.d.ts
│   └── collectPaths.ts           tree → every reachable URL (feeds the type surface)
├── core/
│   ├── moduleConstants.ts  virtual module ids & \0 helpers
│   ├── tree.ts             segment parser + TreeNode + addFileToTree + validate
│   ├── routeConfig.ts      source-level static extraction of `export const route`
│   ├── context.ts          routes context: scan/write/dts/generate
│   └── watch.ts            watcher attach + polling scanner + matchers
└── utils/
    ├── index.ts            string/path/indent helpers
    └── packageCheck.ts     "is a package installed"
```

Runtime dependencies are minimal on purpose: `unplugin` (only used by the
generic entry) and `picomatch` (exclude and `filePatterns` matching).
`chokidar` is only used by tests. `react-router`/`vite` are peers.

## Route tree model and insertion rules

`TreeNode` carries everything needed to generate one route
(`src/core/tree.ts`):

```ts
interface TreeNode {
  rawSegment: string            // on-disk name ('users', '[id]', '(admin)', '')
  kind: 'group' | 'static' | 'param' | 'splat'
  pathSegment: string           // React Router form: ':id', '*', raw, or '' (pathless)
  file: string | null           // layout/leaf module (layout.tsx or a leaf file)
  fileConfig?: PageRouteConfig  // that file's export const route
  indexFile: string | null      // index module (absolute path)
  indexConfig?: PageRouteConfig
  children: Map<string, TreeNode>
  parent: TreeNode | null
}
```

`addFileToTree` resolves four special situations at insertion time:

1. an `index` file → attached to the parent node as `indexFile`;
2. a file whose raw name already exists as a directory → becomes that
   directory's `file` (the “same-name layout”);
3. a directory created later under an existing leaf → the leaf keeps its
   `file` and grows `children` (it becomes a layout automatically);
4. **optional parameter files** `[[x]]`/`[[...x]]` → register an `indexFile`
   (the no-param URL) on the same node **and** create a new `[x]`/`[...x]`
   child node, both `file`s pointing at the same module; and (when enabled)
   `layout.tsx` → the current directory node's `file`.

`validateTreeConfig()` validates config placement **after the whole tree is
built**: `path` overrides only on true leaves, no `caseSensitive` on an index,
no route group combining a `layout.tsx` with an `index.tsx` layout, etc.

## Codegen rules (tree → RouteObject)

`generateRouteRecords.ts` walks the tree, emits plain JS, and handles the three
special record shapes of v0.2:

| Scenario | Emitted |
| --- | --- |
| plain static/param leaf | `{ path, lazy }` |
| optional `[[x]]` file | an `{ index: true, lazy }` under the directory + a `{ path: ':x', lazy }` (same module) |
| absolute `path` override (starts with `/`) | the leaf is **promoted to the top level**; if its on-disk parent directory ends up with no records left, the parent is not generated (React Router does not allow a child record to nest an inconsistent absolute path) |
| relative `path` override | only replaces that record’s `path` value |
| `caseSensitive` / `handle` overrides | emitted statically onto the record fields |
| root `layout.tsx` (`layoutFile`) | a pathless top-level wrapper around the root index, the plain records and the promoted records |
| dot-nesting (`dotNesting`) | middle static segments only contribute URL segments (no file, no index) |

The lazy loader generated for every page module:

```js
lazy: async () => { const m = await import('/abs/…/page.tsx'); return { Component: m.default, ...m } }
```

- Absolute POSIX import paths are used inside the virtual module.
- The module source is plain JS: virtual ids have no extension, so bundlers
  parse them as JS. Any TS syntax (`import type`, `satisfies`) would break
  parsing — types live in the ambient declaration instead.
- Output is deterministic: siblings sorted by name, splat last, promoted
  records sorted by path.

## Route config extraction (`export const route`)

Because React Router forbids `lazy` from changing static fields, path/case
overrides must be known at build time. `routeConfig.ts` performs a
**source-level static extraction** on every page file:

- only a top-level `export const route = <object literal>` is recognised;
- the scanner skips strings, template strings and comments, so look-alike
  occurrences inside component code or copy text do not false-match;
- values may only be literals (string/number/boolean/null/nested arrays and
  objects); identifiers, function calls, template strings, spreads and
  concatenation are hard errors with the file path;
- unknown keys, duplicate keys and duplicate exports are errors (so typos are
  not silently swallowed).

> We deliberately add no Babel/compiler dependency: this is plain-text
> parsing — a few dozen lines, exhaustively testable. The trade-off: computed
> values are **not supported** — put computed values in the `loader` or write
> them out literally.

## Type design and differences with uvr

`unplugin-vue-router`'s typed router works because Vue Router has **named
routes** and a global type-registration mechanism (`declare module
'vue-router'`). React Router has neither, so v0.2 offers a type surface that
fits the React ecosystem instead:

1. `typed-routes.d.ts` declares the virtual module `routes: RouteObject[]`
   (same as v0.1);
2. **`AppRoutePath`** — a literal union of every reachable URL
   (`collectPaths.ts` gathers them from the tree, sharing the same tree as
   codegen, so it cannot drift);
3. **`AppRouteParams` / `RouteParams<P>`** — the per-route param shape, fed to
   `useParams<RouteParams<'/users/:id'>>()`;
4. **`RouteConfig`** — the annotation type for `export const route`;
5. **`LoaderData<T>`** — the convenience alias for
   `useLoaderData<LoaderData<typeof loader>>()`.

No global inference of `useLoaderData`/`Link` (that would require a custom
router with generated types, the TanStack Router approach) — this remains the
plugin's boundary; the docs tell users to pass literal-path generics in their
components.

## Dev / HMR behaviour (v0.2)

**What works**

- Editing an existing page: standard Vite HMR for that page module (the
  plugin does not interfere).
- First load and production build: covered by unit tests and the SSR e2e
  suite.
- Adding/removing/renaming page files: `configureServer` attaches
  `attachPageWatcher` to `server.watcher`; `add`/`unlink` events (when the
  file is a page file and not excluded) trigger a debounced rescan →
  invalidating the virtual module and doing a full reload so that
  `createBrowserRouter(routes)` re-runs with the new route table.

**Watch strategy (`Options.watch`)**

- `true` (default): event-driven when a dev-server watcher is available;
  falls back automatically to the polling scanner when none is available.
- `'polling'`: force polling (a 300 ms signature comparison of the page files
  per folder). In some Vite 8 / Rolldown environments, watcher listeners
  registered from inside a plugin have been observed to miss events — if you
  hit that, use `'polling'` explicitly.
- `false`: disabled entirely (structural changes need a dev-server restart).

Plain content edits inside a page file **never** trigger a rescan: the file
already belongs to the route table, and Vite handles component HMR for the
module itself.

## Comparison: this plugin vs unplugin-vue-router internals

| Concern | unplugin-vue-router | unplugin-react-router (v0.2) |
| --- | --- | --- |
| Framework | Vue Router ≥ 4.4 | React Router v8, data mode |
| Scan | chokidar + tinyglobby | `fs.readdir` walk + dev-server watcher / polling fallback |
| Tree | `PrefixTree` + `TreeNodeValue` (view overrides, query params, names) | simplified `TreeNode` (file/indexFile/config/children) |
| Codegen | per-node Vue route records + `_mergeRouteRecord` | per-node `RouteObject` + lazy wrapper (incl. promotion / optional split) |
| Macro | `definePage` (babel transform) + `<route>` block | `export const route` literal + source-level static extraction |
| Types | `typed-router.d.ts` + Vue Router augmentation | `typed-routes.d.ts` + `AppRoutePath`/`RouteParams`/`RouteConfig`/`LoaderData` |
| Loaders | experimental `data-loaders` | native `loader`/`action` |
| HMR routes | `router.addRoute/removeRoute` | module invalidation + full reload (event-driven or polling) |
| Bundlers | unplugin (vite/webpack/rolldown/…) | Vite-native + unplugin factory (webpack/rollup/esbuild subpaths) |

## Known limitations (v0.2)

1. **Partial params cannot be expressed**: repeatable (`[id]+`), partial
   (`prefix-[id]`) and directory-level optional (`[[x]]/`) segments are not
   supported — React Router's path syntax cannot express them; optional params
   only work at the file level and are split into two routes.
2. **`middleware` cannot be provided through page files**: React Router only
   allows middleware via the *object* form of `lazy`; our function form is
   explicitly forbidden from returning it (see
   [Route modules](route-modules.md)).
3. **No named routes / no global `useLoaderData`/`Link` inference**: a
   structural consequence of React Router (see “Type design”).
4. **An absolute `path` override leaves its on-disk parent directory**: once
   promoted to the top level it is no longer wrapped by intermediate directory
   layouts (it is still wrapped by a root `layout.tsx`); this is not a bug but
   a React Router path constraint.
5. **`layout.tsx` and dot-nesting are off by default**: enable
   `layoutFile`/`dotNesting` explicitly (same-name-file layouts and literal
   dots are the default, backwards-compatible conventions).
6. Versioning: v0.2 targets `react-router@8` (peer) and Node ≥ 20.19.
   Framework mode and an SSR runtime are not built in (the output is plain
   `RouteObject[]`; you can use it for SSR/SSG yourself).

## v0.1 roadmap → v0.2 status

| v0.1 roadmap item | Status |
| --- | --- |
| Structural rescan driven by Vite's own pipelines | ✅ dev-server watcher + `watch: 'polling'` fallback; real-browser E2E on Vite 8 still to run (tests cover it at dev-server level) |
| Per-file route-level overrides (path/caseSensitive/handle) | ✅ `export const route` (static extraction) |
| Per-folder `filePatterns` | ✅ `RoutesFolderOption.filePatterns` |
| Dot-nesting | ✅ `dotNesting: true` |
| Optional params auto-split into two routes | ✅ `[[x]].tsx` / `[[...x]].tsx` |
| Types: path-literal unions, `useParams` param helpers, `LoaderData` | ✅ `AppRoutePath` / `RouteParams<P>` / `LoaderData<T>` |
| Layout special file `layout.tsx` (opt-in) | ✅ `layoutFile: 'layout'` |
| Rollup/rolldown watch via `unplugin` | ✅ rollup/rolldown rebuilds rescan natively + `./rollup` etc. subpaths |
| Publishing setup (changesets, CI, npm provenance) | ✅ added |

## Still to explore

- A real-browser (Playwright) end-to-end matrix on Vite 8 (Rolldown);
- a root fix for unreliable watcher events in some Vite 8 environments
  (currently mitigated with `'polling'`);
- finer-grained “route module splitting” (loader and component in separate
  chunks);
- TanStack-Router-style custom typed-route integration (beyond the current
  boundary).
