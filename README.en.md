> **English** · [简体中文](README.md)

# unplugin-react-router

> File based routing for [React Router](https://reactrouter.com) v8 — inspired by
> [unplugin-vue-router](https://uvr.esm.is/). Zero-config Data Mode SPA: drop a
> file into `src/pages`, get a lazy-loaded typed route.

```txt
src/pages/
├── index.tsx          →  /              # home
├── about.tsx          →  /about
├── users/
│   ├── index.tsx      →  /users         # list page (index route)
│   └── [id].tsx       →  /users/:id     # detail (loader + ErrorBoundary)
├── blog.tsx           →  /blog          # layout (file named like its folder)
└── blog/
    ├── index.tsx      →  /blog          # default content
    └── [slug].tsx     →  /blog/:slug    # rendered inside blog.tsx <Outlet/>
```

## Highlights

- **No framework mode.** Plain React Router v8 *Data Mode* + Vite. No `root.tsx`,
  no `@react-router/dev`, no Remix runtime — `createBrowserRouter(routes)` only.
- **Free code splitting.** Every page module is loaded through a generated
  `route.lazy`, so component, `loader`, `action` and error boundaries are split
  per route.
- **Route-module contract.** `default` export = component; named exports
  (`loader`, `action`, `handle`, `ErrorBoundary`, `HydrateFallback`,
  `shouldRevalidate`) become the matching route properties.
- **Route-level overrides (v0.2).** An `export const route = { path,
  caseSensitive, handle }` in a page (plain literal, read statically at build
  time) overrides the URL / case sensitivity / static `handle` — the React
  equivalent of `definePage`/`<route>` blocks.
- **unplugin-vue-router conventions** adapted to React Router: `index`,
  `[param]`, `[...splat]`, pathless groups `(name)`, same-name folder layouts;
  plus optional parameters `[[lang]].tsx` (auto-split into two routes),
  opt-in dot-nesting (`dotNesting`), an opt-in `layout.tsx` special file
  (`layoutFile`), multiple routes folders with prefixes, custom extensions,
  excludes and per-folder `filePatterns`.
- **Declarative layout binding (v0.3).** `layouts: { dir: 'src/app',
  default: 'blank' }` switches on a page-declared layout model: layout
  components are discovered by name under `dir` (recursively, `components`
  dirs skipped); every top-level page that does not declare a layout is
  wrapped by the `default` shell, and writing
  `export const route = { layout: 'admin' }` in a page moves it into the
  `admin` shell — like the Vue `definePage`/layouts experience, while pages
  stay flat in `src/pages`.
- **Typed out of the box (v0.2).** The generated `typed-routes.d.ts` declares
  the virtual `unplugin-react-router/routes` module and exports
  `AppRoutePath` (a union of every URL), `RouteParams<'/users/:id'>`
  (per-route params, feed it to `useParams`), `RouteConfig` and
  `LoaderData<T>`.
- **Dev experience.** Adding/removing/renaming page files hot-updates
  immediately (dev-server watcher driven, `watch: 'polling'` as a fallback) —
  no restarts.
- **Multiple bundlers**: `vite`, `webpack`, `rollup` (incl. rolldown),
  `esbuild`.

## Quick start

```bash
pnpm add -D unplugin-react-router
pnpm add react-router@^8
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from 'unplugin-react-router/vite'

export default defineConfig({
  plugins: [react(), reactRouter()],
})
```

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from 'unplugin-react-router/routes'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
```

> `.tsx`/`.jsx` files under `src/pages/` are scanned by default. The plugin also
> writes `typed-routes.d.ts` (with the route type surface) at your project root
> so TypeScript understands the virtual import (add it to your `tsconfig`
> `include` if not picked up).

### Optional: declarative layouts (v0.3)

Keep shared layout components in one directory (e.g. `src/app/`), leave pages
flat in `src/pages`, and declare per page which layout wraps it:

```ts
// vite.config.ts
reactRouter({
  layouts: { dir: 'src/app', default: 'blank' }, // the default shell must exist
})
```

```txt
src/app/
├── blank.tsx        # default shell: wraps every top-level page without a declaration (<Outlet/>)
└── admin.tsx        # a named shell
src/pages/
├── login.tsx        # undeclared → automatically inside the blank shell
└── dashboard.tsx    # declared → moved into the admin shell
```

```tsx
// src/pages/dashboard.tsx
export const route = { layout: 'admin' } // wrapped by src/app/admin.tsx
```

While `layouts` is on, directories no longer imply layouts (they only shape
URLs); implicit directory layouts (`layoutFile`, same-name layouts) are
rejected at build time with guidance. See
[File conventions → Declarative layouts](docs/en/file-conventions.md).

A typed usage example (types exported by the generated file — pure types, no
runtime cost):

```tsx
import { useParams } from 'react-router'
import type { AppRoutePath, RouteParams } from 'unplugin-react-router/routes'

// src/pages/users/[id].tsx
const { id } = useParams<RouteParams<'/users/:id'>>() // id: string

// for situations where you need to enumerate every route
const known: AppRoutePath[] = ['/', '/about', '/users/:id']
```

## Languages

| Language | Entry |
| --- | --- |
| **English** | this page + [docs/en](docs/en/) |
| 简体中文（默认） | [README.md](README.md) + [docs/zh](docs/zh/) |

## Documentation

| Document | What you will find |
| --- | --- |
| [Getting started](docs/en/getting-started.md) | Requirements, installation, configuration, entry point, TypeScript wiring, first page |
| [File conventions](docs/en/file-conventions.md) | The full file → route mapping, layouts, optional params, dot-nesting, dynamic/splat segments, edge cases and errors |
| [Route modules](docs/en/route-modules.md) | The page-module contract, `export const route` overrides, generated lazy loader, type-surface guidance |
| [API reference](docs/en/api.md) | `Options`, `RoutesFolderOption`, virtual module, generated files, package exports, every error message |
| [Architecture](docs/en/architecture.md) | Motivation, module map, route-tree model, codegen, virtual module, dev/HMR behaviour, comparison with unplugin-vue-router, known limitations & v0.3 status |
| [Testing & contributing](docs/en/testing.md) | Test matrix, how each suite works, dev commands, how to add coverage |

The Chinese version lives in [docs/zh](docs/zh/); both are kept in
one-to-one correspondence (`getting-started.md` … `testing.md`).

## Ecosystem context

| Approach | Trade-offs |
| --- | --- |
| **This plugin** | Library/data-mode SPA, no framework, conventions close to unplugin-vue-router, typed virtual module |
| [React Router Framework mode](https://reactrouter.com/start/framework/routing) (`@react-router/dev` + `fs-routes`) | Powerful but requires framework mode: `root.tsx`, config files, server runtime |
| [vite-plugin-react-router-fs](https://github.com/eralvarez/vite-plugin-react-router-fs) | Community plugin writing a physical `routes.ts`; lighter, different conventions |

See [Architecture → Motivation](docs/en/architecture.md) for the full comparison.

## Status

**v0.3**. Codegen, tree rules, optional params, route-level overrides, the type
surface, declarative layouts (`layouts`), the virtual module and the
route-module contract are covered by unit tests plus React Router v8 SSR and
real-browser Playwright suites (see
[Testing & contributing](docs/en/testing.md)). Releases go through changesets +
GitHub Actions (npm provenance); read the
[known limitations](docs/en/architecture.md) before adopting it.

## License

MIT
