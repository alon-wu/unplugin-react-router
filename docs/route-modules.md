# Route modules

A page file is a **route module**. Its exports are picked up by the generated
`route.lazy` loader and become the properties of the matching React Router
route — this is the React-side replacement for `definePage`/`<route>` blocks
and the biggest simplification over `unplugin-vue-router`.

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
| `middleware` | `middleware` | ⚠️ **not supported through page files** (see below) |

Anything else exported is ignored by React Router at runtime (the spread keeps
the module honest, extra keys are simply not assigned as route properties).

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

export const handle = { crumb: 'User' }

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

## Types in page modules

React Router's data-mode types are *per module*, not inferred globally:

```ts
// loader return type feeding the component's useLoaderData:
const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
```

This is the official React Router pattern for library mode. The plugin does not
(and cannot, without a custom router/type registry) auto-wire `useLoaderData`
generics globally — that is the one deliberate difference from
`unplugin-vue-router`’s typed-router, explained in
[Architecture → Type design](architecture.md#type-design-and-differences-with-uvr).

`loader`/`action` parameters are fully typed out of the box:

```ts
export async function loader({ params, request, context }: LoaderFunctionArgs)
```

## Middleware (why page files cannot provide it)

React Router lets you lazy-load `middleware` only through the **object** form of
`lazy` (`lazy: { middleware: async () => (await import('./x')).middleware }`).
The **function** form we generate (`lazy: async () => ({...})`) is explicitly
forbidden from returning `middleware` (an unsupported key — React Router needs
to know about middleware *before* resolving other lazy properties).

Consequences for v0.1:

- Do **not** export `middleware` from a page file; it would be ignored with a
  console warning.
- Middleware-based layouts/auth belong in a hand-written route record if you
  need them today (extend the generated tree later, or see Roadmap).

## Code splitting behaviour

Each page module is its own dynamic import, so Vite/Rolldown emit one chunk per
page:

```txt
dist/assets/_id_-D3kP9x.js       # users/[id].tsx (component + loader + boundary)
dist/assets/_...rest_-Q2uZ.js    # [...rest].tsx
dist/assets/blog-B0mQ.js         # blog.tsx layout
```

Component, loader, action and boundary of one page travel together in the same
chunk — navigation downloads exactly the pages it needs. (Finer-grained
“split route modules”, splitting loader from component, is a possible future
optimisation.)

## ErrorBoundary behaviour notes

- A page-level `ErrorBoundary` catches errors thrown by that route's own
  loaders/actions/rendering.
- Because the boundary is lazy too, an error that happens *while loading the
  page module itself* falls through to the nearest ancestor boundary (or the
  default React Router error element) — keep a top-level boundary in mind for
  production apps if that matters to you.

## Route-object properties you cannot declare per file (v0.1)

| Property | How to get it today |
| --- | --- |
| `caseSensitive` | not supported (would need route-level config) |
| `id` | auto-generated by the data router; you rarely need one |
| `path` / `index` | derived from the file name; cannot be overridden per file |
| `unstable_validateParams` | React Router v8 param validation; not wired yet |

Overriding `path` per file (like uvr's `<route>` block) is a possible future
feature — see [Roadmap](architecture.md#roadmap).
