# unplugin-react-router

> File based routing for [React Router](https://reactrouter.com) v8 — inspired by
> [unplugin-vue-router](https://github.com/posva/unplugin-vue-router). Zero-config
> Data Mode SPA: drop a file into `src/pages`, get a lazy-loaded typed route.

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
- **unplugin-vue-router conventions** adapted to React Router: `index`,
  `[param]`, `[...splat]`, pathless groups `(name)`, same-name folder layouts,
  multiple routes folders with prefixes, custom extensions, excludes.
- **Typed out of the box.** A generated `typed-routes.d.ts` types the virtual
  `unplugin-react-router/routes` module.

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
> writes `typed-routes.d.ts` at your project root so TypeScript understands the
> virtual import (add it to your `tsconfig` `include` if not picked up).

## Documentation

| Document | What you will find |
| --- | --- |
| [Getting started](docs/getting-started.md) | Requirements, installation, configuration, entry point, TypeScript wiring, first page |
| [File conventions](docs/file-conventions.md) | The full file → route mapping table, layouts, groups, dynamic/splat segments, edge cases and errors |
| [Route modules](docs/route-modules.md) | The page-module contract, generated lazy loader, supported exports and typing guidance |
| [API reference](docs/api.md) | `Options`, `RoutesFolderOption`, virtual module, generated files, package exports, every error message |
| [Architecture](docs/architecture.md) | Motivation, module map, route-tree model, codegen, virtual module, dev/HMR behaviour, comparison with unplugin-vue-router, known limitations & roadmap |
| [Testing & contributing](docs/testing.md) | Test matrix, how each suite works, dev commands, how to add coverage |

## Ecosystem context

| Approach | Trade-offs |
| --- | --- |
| **This plugin** | Library/data-mode SPA, no framework, conventions close to unplugin-vue-router, typed virtual module |
| [React Router Framework mode](https://reactrouter.com/start/framework/routing) (`@react-router/dev` + `fs-routes`) | Powerful but requires framework mode: `root.tsx`, config files, server runtime |
| [vite-plugin-react-router-fs](https://github.com/eralvarez/vite-plugin-react-router-fs) | Community plugin writing a physical `routes.ts`; lighter, different conventions |

See [Architecture → Motivation](docs/architecture.md#motivation-and-design-goals) for the full comparison.

## Status

Early **v0.1 prototype**. Codegen, tree rules, the virtual module and the
route-module contract are covered by unit tests plus a React Router v8 SSR
end-to-end suite; see [Testing](docs/testing.md). Read the
[known limitations](docs/architecture.md#known-limitations) before adopting it.

## License

MIT
