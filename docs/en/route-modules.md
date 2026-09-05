> **English** · [简体中文](../zh/route-modules.md)

# Route modules

A page file is a **route module**. Its exports are picked up by the generated
`route.lazy` loader and become the properties of the matching React Router
route — this is the React-side replacement for `definePage`/`<route>` blocks.

## Supported exports

| Export | Route property | Notes |
| --- | --- | --- |
| `default` | `Component` | the page component (React Router treats it as the module default; we map it explicitly) |
| `loader` | `loader` | runs before rendering; receives `LoaderFunctionArgs` |
| `action` | `action` | mutations via `<Form>` / `useFetcher` / `useSubmit` |
| `ErrorBoundary` | `ErrorBoundary` | rendered when the route (or its children) throws |
| `HydrateFallback` | `HydrateFallback` | shown during initial hydration of a data router |
| `handle` | `handle` | arbitrary data reachable via `useMatches()` |
| `shouldRevalidate` | `shouldRevalidate` | opt out of default revalidation |
| `route` | — (build time) | **route-level override**: `export const route = {…}` is a *plain literal* object read at build time (see below) |
| `middleware` | `middleware` | ⚠️ **not supported through page files** (see below) |

Anything else exported is ignored by React Router at runtime (the spread keeps
the module honest, extra keys are simply not assigned as route properties).

## Route-level override: `export const route`

React Router **forbids `lazy` from changing a route's static fields** (`path`,
`caseSensitive` must exist statically on the route object). So, for
“per-file route overrides”, the plugin reads a top-level, plain-literal
`export const route` from the source **at build time**:

```tsx
// src/pages/users/[id].tsx —— on-disk path /users/:id
import type { RouteConfig } from 'unplugin-react-router/routes'

export const route = {
  path: '/user/:id', // absolute path: promotes this route to the top level
  caseSensitive: true,
  handle: { crumb: 'User' },
} satisfies RouteConfig

export default function User() {
  return <h1>User</h1>
}
```

### Supported keys and semantics

| Key | Type | Semantics |
| --- | --- | --- |
| `path` | `string` | Overrides the generated path of the record. **Starting with `/` = absolute URL**: since React Router does not allow a child record with an absolute path inconsistent with its parent chain, the route is **promoted to the top level** (its on-disk parent directory stops generating routes if it becomes empty as a result). Not starting with `/` = overrides the current record’s relative path value |
| `caseSensitive` | `boolean` | the generated record carries `caseSensitive` |
| `handle` | any serialisable literal | the generated record statically carries `handle` (no need to also export `handle` from the module) |

Rules and limits:

- **Must be a plain object literal**: values may only be string/number/boolean/
  null/array/object literals. Identifiers, function calls, template strings,
  spreads, `+` concatenation, etc. are errors (they cannot be evaluated
  statically at build time) — put computed values in the `loader`, or write
  them out literally.
- Suffixes such as `satisfies RouteConfig` / `as const` are allowed; quoted
  keys and trailing commas are allowed.
- At most one `export const route` per file; unknown keys and wrongly-typed
  keys are hard errors (with the file path) so typos are not silently ignored.
- `path` overrides **only apply to real leaf pages**: on `index.tsx`, layout
  files (same-name layouts / `layout.tsx`) and optional parameter files
  (`[[x]]`) the `path`/`caseSensitive` semantics are ambiguous and are rejected
  (an optional file may only carry `handle`).
- Do not both export `handle` from the module and assign `route.handle` — the
  former (runtime) wins over the latter. Pick one.
- `export const route` is a top-level statement; it does not take part in
  runtime logic (when the module is lazy-loaded the constant stays in the
  bundle but is not a route property — `lazy` only forwards `Component` and
  route fields to React Router).

> Note: this is the React-side equivalent of `unplugin-vue-router`’s
> `definePage`/`<route>` block. Vue rewrites SFCs with a compiler macro; here a
> “typed literal export + build-time static extraction” does the job with no
> macro and no Babel plugin.

## Full example

```tsx
// src/pages/users/[id].tsx
import {
  useLoaderData,
  useParams,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id)
  if (Number.isNaN(id)) throw new Response('Unknown user', { status: 404 })
  return { id }
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  return { ok: true, name: form.get('name') }
}

export function ErrorBoundary() {
  return <p>This user could not be loaded.</p>
}

export default function User() {
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  const { id } = useParams()
  return (
    <main>
      <h1>User {data.id}</h1>
      <p>param id: {id}</p>
    </main>
  )
}
```

The generated record for that file looks like:

```js
{
  path: ':id',
  lazy: async () => {
    const m = await import('/abs/path/src/pages/users/[id].tsx')
    return { Component: m.default, ...m }
  },
}
```

### Why `{ Component: m.default, ...m }`?

React Router v8's **router** layer does *not* automatically map the `default`
export of a lazy-loaded module onto `Component` — that mapping exists in the
framework (`@react-router/dev`) layer, not in `react-router` itself (verified
in the v8 source: `loadLazyRoute` assigns the resolved module's keys directly
and `defaultMapRouteProperties` only converts `Component`/`HydrateFallback`/
`ErrorBoundary`). To stay robust for **library/data mode** we therefore map
`default` → `Component` explicitly and forward every other export. This works
regardless of which React Router version the user installs.

## Typed route surface (v0.2)

The generated `typed-routes.d.ts` (project root by default) declares the
virtual module and additionally exports types derived from the page tree:

```ts
import type { AppRoutePath, RouteParams, LoaderData } from 'unplugin-react-router/routes'
```

- **`AppRoutePath`** — a literal union of every reachable URL:
  `'/' | '/about' | '/users/:id' | …`. Useful for `Link`/`useNavigate` target
  variables, exhaustive matches over the route table, etc.
- **`RouteParams<P extends AppRoutePath>`** — the per-route param shape:
  ```tsx
  const { id } = useParams<RouteParams<'/users/:id'>>()
  // id: string
  ```
  A param-less path yields `Record<string, never>`; a catch-all route’s param
  key is `'*'`.
- **`LoaderData<T>`** — a convenience alias for a loader’s return type:
  ```tsx
  const data = useLoaderData<LoaderData<typeof loader>>()
  ```
- **`RouteConfig`** — the recommended annotation type for the
  `export const route` above.

`loader`/`action` argument types in page modules work out of the box
(`LoaderFunctionArgs`, etc.); on the component side, wiring `useLoaderData`
stays with React Router’s official library-mode pattern
(`as Awaited<ReturnType<typeof loader>>`, or `LoaderData<typeof loader>`
above). The plugin does not (and cannot, without a custom route registry)
globally rewrite the generics of `useParams`/`useLoaderData`/`Link` — that is
one structural difference from `unplugin-vue-router`’s typed-router, explained
in [Architecture → Type design](architecture.md).

## Middleware (why page files cannot provide it)

React Router lets you lazy-load `middleware` only through the **object** form
of `lazy` (`lazy: { middleware: async () => (await import('./x')).middleware }`).
The **function** form we generate (`lazy: async () => ({...})`) is explicitly
forbidden from returning `middleware` (an unsupported key — React Router needs
to know about middleware *before* resolving other lazy properties).

Consequences since v0.1:

- Do **not** export `middleware` from a page file; it would be ignored with a
  console warning.
- If you need middleware-based layouts/auth today, put it in a hand-written
  route record.

## Code splitting behaviour

Each page module is its own dynamic import, so Vite/Rolldown emit one chunk per
page:

```txt
dist/assets/_id_-D3kP9x.js       # users/[id].tsx (component + loader + boundary)
dist/assets/_...rest_-Q2uZ.js    # [...rest].tsx
dist/assets/blog-B0mQ.js         # blog.tsx layout
```

Component, loader, action and boundary of one page travel together in the same
chunk — navigation downloads exactly the pages it needs. (The two URLs of an
optional `[[x]].tsx` point at the same module, so they share one chunk.)

## ErrorBoundary behaviour notes

- A page-level `ErrorBoundary` catches errors thrown by that route's own
  loader/action/rendering.
- Because the boundary itself is lazy too, an error that happens *while loading
  the page module* falls through to the nearest ancestor boundary (or the
  default React Router error element) — keep a top-level boundary (e.g. the
  root `layout.tsx` of `layoutFile`) in mind for production apps if that
  matters to you.
