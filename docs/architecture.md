# Architecture

This page explains how the plugin works internally, why it was designed this
way, how it compares with `unplugin-vue-router`, and what is known to be
limited or unfinished.

## Motivation and design goals

React Router v8 (data mode) is a great fit for file-based routing because a
route table is just a `RouteObject[]` fed to `createBrowserRouter`, and route
objects already support `lazy` loading of route modules. `unplugin-vue-router`
(uvr) proved the architecture for the Vue side:

| uvr building block | Can it be reused for React? | How |
| --- | --- | --- |
| Folder scan + route tree (`PrefixTree`) | ✅ yes | same tree model, different segment grammar output |
| `codegen` (tree → source text) | ✅ yes | we emit `RouteObject` literals instead of `RouteRecordRaw` |
| Virtual module (`vue-router/auto-routes`) | ✅ yes | `unplugin-react-router/routes` |
| Watcher + module invalidation | ✅ yes (mechanics) | polling + `reloadModule`/full reload |
| `definePage` / `<route>` block parsing | ❌ not needed | named exports of a TSX module are the contract |
| Typed router (`typed-router.d.ts` route names) | ⚠️ not portable | React Router has no named routes — see [Type design](#type-design-and-differences-with-uvr) |
| `data-loaders` subsystem | ❌ not needed | `loader`/`action` are native to React Router |

**Target**: SPA data mode, Vite-first, plain `react-router`, no framework
runtime, route-module contract familiar from Remix, conventions close to uvr.

Comparison with the alternatives:

- **React Router Framework mode** (`@react-router/dev` + `fs-routes`): full
  framework (root route required, config files, bundler/server plugins). This
  plugin targets apps that want file routing without adopting the framework.
- **vite-plugin-react-router-fs** (community): scans a folder and *writes a
  physical* `routes.ts`. Different conventions (`layout.tsx`/`guard.tsx`
  special files). This plugin uses a virtual module and uvr-style conventions.

## High-level data flow

```txt
pages/*.tsx ──scan──▶ route tree ──codegen──▶ TS/JS source ──virtual module──▶ app

  build/dev start             + add/remove page files (dev)
        │                                    │
        ▼                                    ▼
  scanPages()  ◀─────────────  polling scanner (300ms signature diff)
        │
        ├─▶ rebuild tree (from scratch, deterministic)
        ├─▶ if structure changed:
        │      server.invalidateRoutes()   (reload virtual module)
        │      server.reload()             (full page reload)
        └─▶ writeDTS() (typed-routes.d.ts, only on content change)
```

`getRoutes()` (the virtual module's `load`) is lazy: it serialises the current
tree only when the module is requested, so a scan is cheap and the module is
always fresh after invalidation.

## Module map

```txt
src/
├── index.ts                unplugin factory entry (generic bundlers, no dev server)
├── vite.ts                 re-exports the native Vite plugin
├── vitePlugin.ts           the real Vite plugin (recommended entry)
├── options.ts              Options / RoutesFolderOption, defaults, resolution
├── codegen/
│   ├── generateRouteRecords.ts   tree → virtual module source (pure function)
│   └── generateDTS.ts            content of typed-routes.d.ts
├── core/
│   ├── moduleConstants.ts  virtual module ids & \0 helpers
│   ├── tree.ts             segment parser + TreeNode + addFileToTree
│   ├── context.ts          routes context: scan/write/dts/generate, server API
│   └── watch.ts            watcher attachment + polling scanner
└── utils/
    ├── index.ts            string/path/indent helpers
    └── packageCheck.ts     "is a package installed" (typescript detection)
```

Runtime dependencies are minimal on purpose: `unplugin` (only used by the
generic entry) and `picomatch` (exclude matching). `chokidar` is a
dev-dependency used exclusively by tests. `react-router`/`vite` are peers.

## Route tree model

`TreeNode` (`src/core/tree.ts`) carries everything needed to generate one
route object:

```ts
interface TreeNode {
  rawSegment: string                 // on-disk name ('users', '[id]', '(admin)', '')
  kind: 'group' | 'static' | 'param' | 'splat'
  pathSegment: string                // React Router form: ':id', '*', raw, or '' (pathless)
  file: string | null                // same-name layout file OR leaf page module (abs path)
  indexFile: string | null           // 'index' module of this node (abs path)
  children: Map<string, TreeNode>
}
```

Insertion (`addFileToTree`) resolves three special situations **regardless of
file order**:

1. `index` file → stored on the parent node as `indexFile`.
2. File whose raw name already exists as a directory → becomes that
   directory's `file` (the “same-name layout”).
3. A directory created later under an existing leaf → the leaf keeps its
   `file` and gains `children` (it becomes a layout automatically).

Parsing validates React Router expressibility eagerly and throws descriptive
errors (full list in [API reference → Errors](api.md#errors)).

## Codegen rules (tree → RouteObject)

`generateRouteRecords.ts` walks the tree and emits plain JS. Per node:

| Node | Emitted record |
| --- | --- |
| root with `indexFile` | top-level `{ index: true, lazy }` (matches `/`) |
| static/param leaf file | `{ path: '<seg>', lazy }` |
| splat file | `{ path: '*', lazy }` |
| directory, no `file`, with `indexFile` | `{ path, children: [ { index: true, lazy }, …children ] }` — component-less parent; children render through |
| directory with `file` (layout) | `{ path, lazy: layout, children: [ { index: true, lazy }?, …children ] }` |
| group with `indexFile` | pathless layout `{ lazy, children }` |
| group without `indexFile` | component-less pathless `{ children }` |
| empty node | skipped |

The lazy loader generated for every page module:

```js
lazy: async () => { const m = await import('/abs/…/page.tsx'); return { Component: m.default, ...m } }
```

- Absolute POSIX import paths are used inside the virtual module (Vite-native).
- The module source is plain JS: virtual ids have no extension, so bundlers
  parse them as JS. Any TS syntax (`import type`, `satisfies`) would break
  parsing — types live in the ambient declaration instead.
- Output is deterministic: siblings sorted by name, splat last (unit-tested).

## Virtual module

- Public id: `unplugin-react-router/routes`
- `resolveId` maps it to `\0unplugin-react-router/routes`
- `load` returns `ctx.getRoutes()` (generated on demand)
- No runtime imports beyond your page modules; `react-router` appears only as a
  type in the generated ambient `.d.ts`

## Lifecycle

**Vite plugin (`vitePlugin.ts`)**

1. `buildStart` → `ctx.scanPages()`: full walk of every routes folder, build
   tree, write dts.
2. `configureServer` (dev) → registers the server context (`invalidateRoutes`
   via `server.moduleGraph` + `server.reloadModule`; `reload` via
   `server.ws.send({ type: 'full-reload' })`) and starts the polling scanner.
3. `load('…/routes')` → serialise the current tree.
4. `buildEnd` / server close → stop the scanner.

**Rescan (added/removed page files, dev only)**

`createPollingScanner` compares a signature (sorted list of page files
relative to their folders) every 300 ms. On change it calls `scanPages()`,
which:

- rebuilds the whole tree (page folders are small; simplicity wins),
- compares signatures, and only when the *structure* changed: invalidates the
  virtual module and asks for a full page reload (so
  `createBrowserRouter(routes)` re-runs with the new table),
- rewrites `typed-routes.d.ts` only when content changed.

Plain content edits inside a page file **never** trigger a rescan: the file
already belongs to the route table, and Vite handles component HMR for the
module itself.

## Dev/HMR behaviour — and known limitations

**What works**

- Editing an existing page: standard Vite HMR for that page module (the
  plugin does not interfere).
- First load and production build: fully covered by tests.

**What is incomplete**

The structural-rescan path (adding/removing/renaming page files) is *not yet
confirmed working in a real dev session* on every setup. Two implementations
exist in `src/core/watch.ts`:

- `attachPageWatcher` — binds to a bundler watcher (`server.watcher`) and
  filters `add`/`unlink` events;
- `createPollingScanner` — 300 ms polling of the page folders (default).

Both are unit-tested in isolation, and the polling scanner is what
`configureServer` starts by default. However, during development against
Vite 8 (Rolldown) we observed that file events fired by `server.watcher` did
not reliably reach listeners registered from inside the plugin's
`configureServer` (a directly-registered listener in a sibling plugin did
receive them, which points at a bundler/listener plumbing quirk rather than a
logic bug), and — in that same environment — the polling timer never fired
either. Symptoms: after adding a page file the route table may stay stale
until the dev server restarts.

**Workaround today**: restart the dev server after structural file changes.

**Planned fix**: drive structural rescanning from Vite’s own change pipeline
(`handleHotUpdate` plus folder-mtime signatures) and verify with a real
browser end-to-end test (Playwright) on Vite 8. See [Roadmap](#roadmap).

## Type design and differences with uvr

`unplugin-vue-router`'s typed router works because Vue Router has **named
routes** and a global type-registration mechanism (`declare module
'vue-router'`). React Router has neither, so the equivalent machinery is not
portable. Instead the type surface is:

1. **Typed route table** — the ambient declaration exposes `routes:
   RouteObject[]`.
2. **Typed page modules** — `loader`/`action` argument types come from
   `react-router`; use the official
   `useLoaderData() as Awaited<ReturnType<typeof loader>>` pattern for data.
3. **No global inference of `useLoaderData`/`Link` paths** — that would
   require a custom router with generated types (the TanStack Router approach),
   out of scope for a unplugin that emits plain `RouteObject[]`.

Future: generate path-literal unions (`type AppRoutes = '/' | '/users/:id' |
…`) and per-route param types so `useParams`/`useMatches` can be typed via
small helpers — still without touching React Router itself.

## Comparison: this plugin vs unplugin-vue-router internals

| Concern | unplugin-vue-router | unplugin-react-router (v0.1) |
| --- | --- | --- |
| Framework | Vue Router ≥ 4.4 | React Router v8, data mode |
| Scan | chokidar + tinyglobby | plain `fs.readdir` walk + polling (dev) |
| Tree | `PrefixTree` + `TreeNodeValue` (view overrides, query params, names) | simplified `TreeNode` (file/indexFile/children) |
| Codegen | per-node Vue route records + `_mergeRouteRecord` | per-node `RouteObject` literals + lazy wrapper |
| Macro | `definePage` (babel transform) + `<route>` block | none — named module exports |
| Types | `typed-router.d.ts` + Vue Router augmentation | ambient `typed-routes.d.ts` for the virtual module |
| Loaders | experimental `data-loaders` packages | native `loader`/`action` |
| HMR routes | `router.addRoute/removeRoute` + custom HMR handlers | module invalidation + full reload (structural rescan pending) |
| Bundlers | unplugin (vite/webpack/rolldown/…) | Vite-native entry + generic unplugin factory |

## Known limitations (summary)

1. **Dev structural rescan not confirmed** (see above) — restart dev server
   after add/remove/rename of page files.
2. **Unsupported segment grammar** — optional (`[[x]]`), repeatable
   (`[x]+`), partial (`a-[x]`) params; they throw at scan time.
3. **`middleware` cannot be exported by page files** — React Router forbids
   middleware through the lazy-function form (details in
   [Route modules](route-modules.md#middleware-why-page-files-cannot-provide-it)).
4. **No route names / no typed-router** — structural consequence of React
   Router's API (see type design above).
5. **Dot-nesting** (`users.create.tsx` → `/users/create` without UI nesting)
   is not implemented: `.` is literal. uvr semantics differ.
6. **`_inspect`** is reserved but not yet applied to virtual ids.
7. Versioning: v0.1 targets `react-router@8` only (peer). Framework-mode and
   SSR integrations are out of scope by design.

## Roadmap

- **Dev reliability**: structural rescan via Vite's own pipelines + browser
  e2e on Vite 8 (highest priority).
- Route-level overrides per file (`path`, `caseSensitive`, custom `handle`
  merge) as a typed export equivalent of uvr's `<route>` block.
- Per-folder `filePatterns`; dot-nesting; optional-param auto-splitting into
  two routes.
- Types: generated path-literal unions, param helpers for `useParams`, and a
  `LoaderData` convenience type.
- Layout special-file convention (`layout.tsx`) as opt-in.
- Rollup/rolldown watch support via `unplugin` (uses `attachPageWatcher`).
- Publishing setup (changesets, CI, npm provenance).
