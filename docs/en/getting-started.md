> **English** · [简体中文](../zh/getting-started.md)

# Getting started

## Requirements

| Dependency | Version | Notes |
| --- | --- | --- |
| `react-router` | `^8.0.0` (peer) | Data mode SPA. Everything maps onto `RouteObject`. |
| `vite` | `^5 || ^6 || ^7 || ^8` (optional peer) | Only needed when using the `./vite` entry. |
| `react` / `react-dom` | `^19` (typical) | Any version compatible with React Router v8. |
| Node.js | ≥ 20 (CI/dev tested on 24) | ESM-only, uses modern `node:` APIs. |

TypeScript is optional but recommended — the generated `.d.ts` is only written
when a `typescript` install can be detected (or `dts: true` is passed).

## Install

```bash
# with pnpm
pnpm add -D unplugin-react-router
pnpm add react-router@^8

# or npm / yarn
npm i -D unplugin-react-router
npm i react-router@^8
```

## Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from 'unplugin-react-router/vite'

export default defineConfig({
  plugins: [
    react(),
    reactRouter({
      // routesFolder: 'src/pages',   // default
      // extensions: ['.tsx', '.jsx'],// default
      // dts: 'typed-routes.d.ts',    // default when typescript is installed
    }),
  ],
})
```

### Why the `/vite` entry?

The package exposes two entries:

- `unplugin-react-router/vite` — a **native Vite plugin** (recommended). It
  wires up the virtual module **and** the dev-server pieces (polling for added
  and removed page files, module invalidation, full reload).
- `unplugin-react-router` — a generic `unplugin` factory that works with
  rollup/rolldown/… builds. Useful when you build through another bundler; it
  does not provide dev-server watching.

## Wire up the router — the only manual step

```tsx
// src/main.tsx
import React from 'react'
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

`unplugin-react-router/routes` is a **virtual module**: it is not a file on
disk. The plugin intercepts it at build/dev time and answers with the generated
`RouteObject[]` (see [Architecture → Virtual module](architecture.md#virtual-module)).

You can also import the same list under its default export:

```ts
import routes from 'unplugin-react-router/routes'
// routes === the same RouteObject[]
```

## TypeScript wiring

After the first dev/build run the plugin writes (by default)
`typed-routes.d.ts` next to your `root`:

```ts
// typed-routes.d.ts (generated — do not edit)
declare module 'unplugin-react-router/routes' {
  import type { RouteObject } from 'react-router'
  export const routes: RouteObject[]
  export default routes
}
```

Make sure TypeScript sees it. The two common shapes of `tsconfig.json`:

```jsonc
// covers any *.d.ts under the project root
{ "include": ["src", "typed-routes.d.ts"] }

// or simply include the root folder recursively
{ "include": ["."] }
```

> Why does the module need this? Its runtime source is plain JS (bundlers parse
> it as JS because virtual module ids have no extension), so the ambient
> declaration is what gives you editor completion and type-checking.

If you do not use TypeScript, disable generation with `dts: false`.

## Write your first pages

Create `src/pages/index.tsx` and `src/pages/about.tsx`:

```tsx
// src/pages/index.tsx
import { Link } from 'react-router'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <Link to="/about">About</Link>
    </main>
  )
}
```

```tsx
// src/pages/about.tsx
export default function About() {
  return <main><h1>About</h1></main>
}
```

Run `pnpm dev` (or `vite`) and open `http://localhost:5173/` and `/about`.
Each page becomes its own chunk, loaded lazily on navigation. Adding a loader
or an error boundary is only a matter of exporting them from the module — see
[Route modules](route-modules.md).

## Production build

```bash
pnpm build
# or: vite build
```

Vite/Rolldown statically analyse the dynamic imports emitted by the plugin, so
every page file is emitted as its own chunk (you will see `_id_-…js`,
`[...rest]`-derived chunk names, etc.).

## What happens when the pages folder is empty?

`routes` is `[]`. `createBrowserRouter([])` renders nothing and logs a warning
about a missing root route; add an `index.tsx` to get a `/` route.
