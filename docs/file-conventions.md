# File conventions

Every page file is scanned at build/dev time and translated into React Router
`RouteObject`s. This page documents exactly which file means which route — the
rules below are implemented in `src/core/tree.ts` and
`src/codegen/generateRouteRecords.ts`.

## 1. The mental model

A routes folder is turned into a **tree of segments**:

- a **directory** is a path segment (unless it is a group, see §6),
- a **file** inside it is a leaf route for one more segment,
- an **`index` file** is the “default content” of its parent path,
- a **file named exactly like its directory** (e.g. `blog.tsx` next to
  `blog/`) is the *layout component* of that directory’s path segment.

Example tree and the routes it generates:

```txt
src/pages/
├── index.tsx            →  index route at the top level        →  /
├── about.tsx            →  static leaf                          →  /about
├── users/
│   ├── index.tsx        →  index route of users                 →  /users
│   └── [id].tsx         →  dynamic leaf                         →  /users/:id
├── blog.tsx             →  layout of the blog segment           →  /blog (with children)
└── blog/
    ├── index.tsx        →  index route of blog                  →  /blog
    └── [slug].tsx       →  dynamic leaf                         →  /blog/:slug
├── (shop)/…             →  pathless group (no URL segment)
└── [...rest].tsx        →  catch-all                             →  *
```

The generated module (simplified for the tree above):

```js
export const routes = [
  { index: true, lazy: /* index.tsx */ },
  {
    path: 'users',
    children: [
      { index: true, lazy: /* users/index.tsx */ },
      { path: ':id', lazy: /* users/[id].tsx */ },
    ],
  },
  {
    path: 'blog',
    lazy: /* blog.tsx — layout */,
    children: [
      { index: true, lazy: /* blog/index.tsx */ },
      { path: ':slug', lazy: /* blog/[slug].tsx */ },
    ],
  },
  { path: '*', lazy: /* [...rest].tsx */ },
  // about.tsx sorts before blog/* users/* …
]
```

## 2. Segment ↔ path mapping

| On disk          | Meaning                      | Generated path / record |
| ---------------- | ---------------------------- | ----------------------- |
| `index` (file)   | default content of the parent | an `{ index: true }` **child record** of the parent record (at the top level it matches `/`) |
| `about`          | static segment               | `path: 'about'` |
| `[id]`           | dynamic parameter            | `path: ':id'` |
| `[...rest]`      | catch-all                    | `path: '*'` (only valid as a **file**; the splat value lands in `params['*']`) |
| `(admin)`        | pathless **group**           | no `path` property at all |
| `a.b`            | dot is a literal character   | `path: 'a.b'` |

Parameter and group names accept `[A-Za-z0-9_-]` (regex `[\w-]+`).

### Segment validation (hard errors)

While scanning, the plugin throws with a helpful message when a name cannot be
expressed with React Router path syntax:

| Input | Why |
| --- | --- |
| `[[id]]` (optional) | React Router has no optional-segment syntax; split into `index` + `[id]` |
| `[id]+` (repeatable) | same; a catch-all `[...rest]` file is the closest match |
| `prefix-[id]`, `[a][b]`, `x_[id]` (partial/multi params) | React Router params occupy a whole segment |
| `(name).tsx` (group file) | groups are directories; use `(name)/index.tsx` for a pathless layout |
| directory named `[...x]` | splats must be files (`[...x].tsx` inside a directory) |
| directory named `index` | put an `index` file inside the parent instead |
| static segment containing `:` `*` `?` | conflicts with React Router path syntax |

The exact messages are listed in [API reference → Errors](api.md#errors).

## 3. Index routes — “default content”, not layouts

`index.tsx` renders **only** at its own path; it does **not** wrap sibling
routes.

```txt
src/pages/users/
├── index.tsx      # /users            — the users list
└── [id].tsx       # /users/:id        — the detail page
```

- `/users` renders `index.tsx`.
- `/users/42` renders `[id].tsx` **alone** — `index.tsx` is not involved, there
  is no extra layout layer.

This mirrors `unplugin-vue-router` (and Next.js `page.tsx`) semantics: siblings
are independent.

> ⚠️ Because the parent `users` record has **no component**, React Router
> renders its children through (verified against the renderer: when a matched
> route has neither `Component` nor `element`, children are passed through
> directly). There is no hidden `<Outlet/>` requirement.

## 4. Layouts

There are three ways to create shared UI, all of them require an explicit
`<Outlet />` in the layout component for children to appear.

### 4a. Same-name file + folder layout

```txt
src/pages/
├── blog.tsx        # layout component of the blog segment
└── blog/
    ├── index.tsx   # /blog            — rendered inside <Outlet/>
    └── [slug].tsx  # /blog/:slug      — rendered inside <Outlet/>
```

```tsx
// blog.tsx
import { Outlet } from 'react-router'

export default function BlogLayout() {
  return (
    <div>
      <header>Blog</header>
      <Outlet />   {/* index.tsx or [slug].tsx renders here */}
    </div>
  )
}
```

- `/blog` renders the layout + `blog/index.tsx`.
- `/blog/hello` renders the layout + `blog/[slug].tsx`.

File order does not matter: the plugin merges a file with a same-named
directory whenever the second one appears during the scan.

### 4b. Pathless group layout

```txt
src/pages/(shop)/
├── index.tsx     # layout component of the (shop) group
├── cart.tsx      # /cart
└── checkout.tsx  # /checkout
```

Groups do not add URL segments, so the group’s `index.tsx` is a **pathless
layout**: `/cart` renders `(shop)/index.tsx` (with `<Outlet/>`) wrapping
`cart.tsx`, while the URL stays `/cart`.

### 4c. No layout at all

Directories without an `index` and without a same-name file are pure
organisational namespaces that contribute their segment(s) to the URL:

```txt
src/pages/docs/
└── [slug].tsx     # /docs/:slug, no layout wrapper
```

This also covers using a group purely for organisation:

```txt
src/pages/(admin)/
└── dashboard.tsx  # /dashboard — (admin) contributes no segment and no layout
```

## 5. Dynamic segments and catch-alls

```txt
src/pages/
├── products/
│   └── [sku].tsx          # /products/:sku
├── catalog/
│   └── [...rest].tsx      # /catalog/*  (any remaining path)
├── users/
│   └── [id].edit.tsx      # ⚠️ ERROR — partial segment
└── [...rest].tsx          # /*          top-level 404 catch-all
```

Read the param in a route module:

```tsx
// products/[sku].tsx
import { useParams } from 'react-router'

export default function Product() {
  const { sku } = useParams()      // string | undefined
  return <h1>{sku}</h1>
}
```

Catch-all notes:

- The generated path is `'*'`; the matched remainder is `params['*']`
  (React Router semantics), **not** `params.rest`.
- A splat file cannot contain children and cannot be a directory.
- Among sibling records the splat is always emitted **last** (React Router
  ranks it lowest anyway; we keep the output deterministic).

## 6. Route groups `(name)`

- A group contributes **no path segment**.
- With `(name)/index.tsx` the group is a pathless **layout** (4b).
- Without an index the group is transparent: its children are collected under a
  component-less pathless record (renders through, see §3 note).
- A group inside a group, and groups mixed with regular directories, work
  recursively.

```txt
src/pages/
├── (auth)/
│   ├── layout.tsx?  # ✗ not special — groups have no layout file convention;
│   │                #   use (auth)/index.tsx for the layout component
│   └── login.tsx    # /login
└── (docs)/
    ├── index.tsx    # pathless layout for /guides, /reference
    ├── guides.tsx   # /guides
    └── reference.tsx# /reference
```

## 7. Multiple routes folders and prefixes

```ts
reactRouter({
  routesFolder: [
    'src/pages',
    {
      src: 'src/docs/pages',
      // every route of this folder is prefixed
      path: 'docs',
    },
    {
      src: 'src/legacy',
      path: 'docs/[lang]',      // parameterised prefixes are supported
      exclude: ['**/secret/**'],
    },
  ],
})
```

Rules:

- `path` is joined with `/`, must **not** start with `/`, and can contain
  `[param]` segments (they are parsed like directory segments). It creates
  component-less prefix records — children render through (no layout).
- Folders are scanned in order into one tree. Identical routes across folders
  produce a duplicate-file error (see Errors); use distinct prefixes.
- Per-folder `extensions` / `exclude` override the global ones (functions can
  extend the global value instead of replacing it).
- `exclude` globs are **relative to each folder's `src`** (picomatch syntax),
  e.g. `['**/ignored/**']`.

## 8. Custom extensions

```ts
reactRouter({
  extensions: ['.tsx', '.jsx', '.ts'],   // global default
})
```

Notes:

- Extension matching is suffix based; when several match, the **longest**
  suffix wins (so a future `.page.tsx` style is supported without ambiguity).
- Only the file name without the matched suffix becomes the segment:
  `[id].tsx` with `.tsx` → `[id]`; `about.mdx` with `.mdx` → `about`.
- Folders beginning with `.` are skipped by the scanner (dot-files are ignored).

## 9. Ordering & determinism

Generated records are sorted deterministically:

- siblings by raw name (string order),
- the splat always last.

The same page file set always yields byte-identical output (verified by a unit
test), which keeps snapshots and diffs stable.

## 10. Comparison with unplugin-vue-router naming

| unplugin-vue-router (Vue) | unplugin-react-router (this plugin) | Notes |
| --- | --- | --- |
| `index.vue` → path `''` | `index.tsx` → `{ index: true }` child | same “default content” semantics |
| `users.vue` + `users/` nesting | `users.tsx` + `users/` → layout | layout needs `<Outlet/>` |
| `[id].vue` | `[id].tsx` | same |
| `[...path].vue` → `/:path(.*)` | `[...rest].tsx` → `'*'` | param name differs (`'*'`) |
| `[[id]].vue`, `[id]+.vue` | ❌ rejected | React Router cannot express them |
| `prefix-[id].vue` (partial) | ❌ rejected | params occupy whole segments |
| `(group)/` directories | `(group)/` directories | group `index` here means layout, not default content |
| `users.create.vue` dot-nesting | dot kept literally | no implicit `/` splitting (v0.1) |
| named views `index@aux.vue` | ❌ rejected | no Vue named views in React Router |
| `<route>` block / `definePage` | module named exports | see [Route modules](route-modules.md) |
| route **names** + typed router | no names | React Router has no named routes |

## 11. Playground example

The repository playground (`playground/src/pages`) exercises every rule above —
index, param, splat, group layout, organisation-only group, same-name layout —
and is the reference for how each convention is meant to be used:

```txt
playground/src/pages/
├── index.tsx
├── about.tsx
├── users/index.tsx
├── users/[id].tsx
├── blog.tsx
├── blog/index.tsx
├── blog/[slug].tsx
├── (shop)/index.tsx
├── (shop)/cart.tsx
├── (shop)/checkout.tsx
├── (admin)/dashboard.tsx
└── [...rest].tsx
```
