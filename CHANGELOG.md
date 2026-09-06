# unplugin-react-router

## 0.2.0

### Minor Changes

- 3caebf1: **v0.3 — declarative layout binding (`layouts` option)**

  - New `layouts: { dir, default }` vite option. When provided, layout components
    are discovered recursively under `dir` (layout id = file name, `components`
    directories and dot/underscore folders skipped) and `default` must exist.
  - Every top-level member of `src/pages` that does **not** declare a layout is
    wrapped by the default layout shell; a page declaring
    `export const route = { layout: 'admin' }` is moved out of the default shell
    into a sibling `admin` shell (same layout shares one lazy-loaded shell).
    URL/params/handles are unaffected.
  - While `layouts` is enabled, directory-based implicit layouts (same-name
    layout files, pathless group shells, `layoutFile`) are rejected with
    guidance, and mixing layouts inside one top-level directory block errors.
  - `RouteConfig` gains `layout?: string` (build-time static, like `path`).
  - Docs updated; bundled with the existing Playwright browser E2E (a second
    fixture app covers layouts).

- f6cd2c7: **v0.2 — complete roadmap of the v0.1 architecture document.**

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
