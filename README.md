# unplugin-react-router

> File based routing for [React Router](https://reactrouter.com) v8, built in the spirit of
> [unplugin-vue-router](https://github.com/posva/unplugin-vue-router).

Add a page file to `src/pages`, get a lazy loaded route — no route table to
maintain. Page modules are **route modules**: a `default` export is the
component, `loader`/`action`/`handle`/`ErrorBoundary`/`HydrateFallback` named
exports become the corresponding route properties (React Router data mode).

```txt
src/pages/
├── index.tsx               →  /            (top-level index)
├── about.tsx               →  /about
├── users/
│   ├── index.tsx           →  /users       (index route of the segment)
│   └── [id].tsx            →  /users/:id
├── blog.tsx                →  /blog        (layout: file named like its folder)
└── blog/
    ├── index.tsx           →  /blog        (default content)
    └── [slug].tsx          →  /blog/:slug  (rendered in blog.tsx <Outlet/>)
```

## Features

- Zero-config, framework-free (React Router **Data mode** SPA, no Remix-style
  framework setup, no `root.tsx`, no `@react-router/dev`)
- Code splitting for free: every page is loaded through `route.lazy`
- `index`, dynamic (`[id]`), splat (`[...rest]`), pathless route groups
  (`(name)/`), same-name folder layouts (`users.tsx` + `users/`), multiple
  routes folders with static prefixes, exclusions, custom extensions
- Generated `typed-routes.d.ts` giving the virtual module full TS types
- Vite-native plugin (also usable through the `unplugin` factory for
  rollup/rolldown builds)

## Install

```bash
pnpm add -D unplugin-react-router
pnpm add react-router@^8
```

## Usage

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
// src/main.tsx — the only manual wiring you ever need
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

The plugin generates `typed-routes.d.ts` (unless `dts: false`) that declares
the virtual module for TypeScript. Make sure your `tsconfig.json` picks it up
(any `include` that covers the project root `*.d.ts` does).

## Route module contract

A page file is a route module. Its exports map 1:1 onto a React Router route:

```tsx
// src/pages/users/[id].tsx
import { useLoaderData, type LoaderFunctionArgs } from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  return { id: params.id } // loader
}

export function ErrorBoundary() { /* ... */ }     // error boundary
export const handle = { crumb: 'user' }           // matches/handle
// export async function action() {...}           // mutations

export default function User() {                  // Component
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  return <div>{data.id}</div>
}
```

Each module is imported lazily as:

```js
{ path: ':id', lazy: async () => { const m = await import('/abs/users/[id].tsx'); return { Component: m.default, ...m } } }
```

so the whole module — component, loader, boundary — is split into its own
chunk and only loaded when the route matches.

## File naming rules

| File / folder           | Result                     |
| ----------------------- | -------------------------- |
| `index.tsx`             | `index: true` (default content of its parent path, or `/` at the root) |
| `about.tsx`             | `path: 'about'`            |
| `[id].tsx`              | `path: ':id'`              |
| `[...rest].tsx`         | `path: '*'` (catch-all, must be a file) |
| `users/`                | `path: 'users'` segment    |
| `blog.tsx` + `blog/…`   | `blog.tsx` becomes the `blog` layout (wraps children, use `<Outlet/>`) |
| `(admin)/…`             | pathless group: no URL segment; an `(admin)/index.tsx` acts as the group layout, otherwise children are flattened through |
| dots in names           | kept literally (`a.b.tsx` → `a.b`); no implicit splitting |

Directories **without** an `index` only group their children (`/users/1`
renders `[id]` alone, no wrapper). Directories **with** an `index` render the
index content at the directory URL and children under it.

## Options

```ts
interface Options {
  /** folder(s) to scan, default 'src/pages' */
  routesFolder?: string | { src: string; path?: string; extensions?: string[]; exclude?: string[] } | Array<...>
  /** page extensions, default ['.tsx', '.jsx'] */
  extensions?: string[]
  /** picomatch globs ignored per folder, default [] */
  exclude?: string[]
  /** project root, default process.cwd() */
  root?: string
  /** generate the ambient d.ts for the virtual module, default true */
  dts?: boolean | string
  /** debug logs */
  logs?: boolean
  /** watch pages folder, default !process.env.CI */
  watch?: boolean
}
```

## What is intentionally NOT supported (v0.1)

These `unplugin-vue-router` features have no clean React Router equivalent and
fail loudly (or are skipped) on purpose:

- optional (`[[id]]`), repeatable (`[id]+`), partial (`prefix-[id]`) segments,
  named views (`index@aux.vue`), SFC `<route>` blocks / `definePage`
- route **names**: React Router has no named routes, so no typed route-name
  registry is generated
- `middleware` declared in a page module (React Router forbids lazy loading
  middleware through a lazy *function*); declare it statically if needed

## Known limitations

- **Dev hot rescan of added/removed page files**: editing an existing page
  gets normal Vite HMR, but adding or removing a page file does not reliably
  trigger a route-table refresh on every platform/Vite version (see
  `src/core/watch.ts` — a polling scanner and a watcher-based implementation
  both exist). Restart the dev server after structural file changes if routes
  look stale.
- This is an early prototype: check `dist` builds, SSR data-mode behaviour and
  the e2e tests in `tests/` before adopting it.

## Development

```bash
pnpm install
pnpm dev          # playground dev server
pnpm build        # build the plugin (tsup)
pnpm test         # vitest (codegen, tree, watcher, SSR e2e)
pnpm typecheck    # tsc
```

## License

MIT
