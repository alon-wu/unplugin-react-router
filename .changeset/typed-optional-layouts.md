---
'unplugin-react-router': minor
---

**v0.2 — complete roadmap of the v0.1 architecture document.**

- **Typed surface**: the generated `typed-routes.d.ts` now exports
  `AppRoutePath` (union of every route URL), `AppRouteParams` / `RouteParams<P>`
  (per-route param shapes feeding `useParams<RouteParams<'/users/:id'>>()`),
  `RouteConfig` (the type of a page's `export const route`) and
  `LoaderData<T>`.
- **Route-level overrides** (`export const route = { path, caseSensitive,
  handle }`): static, build-time extraction from page modules. An absolute
  `path` (starting with `/`) promotes the route to the top level (React Router
  cannot nest absolute child paths).
- **Optional segments** `[[id]].tsx` / `[[...rest]].tsx` are split into an
  index route plus a `:id`/splat route of the same module.
- **`dotNesting` option**: `users.create.tsx` → `/users/create` (opt-in).
- **`layoutFile` option**: `layout.tsx` becomes the folder layout (opt-in);
  a root `layout.tsx` becomes a pathless wrapper around every route.
- **`filePatterns`** per routes folder: positive glob filter for page files.
- **Dev reliability**: the Vite plugin now attaches to the dev-server file
  watcher (with `watch: 'polling'` as an explicit fallback), so structural
  page changes no longer require a dev-server restart.
- **Bundlers**: new `webpack` / `rollup` / `esbuild` subpath exports.
- **Publishing**: changesets, GitHub Actions CI + release, LICENSE.
