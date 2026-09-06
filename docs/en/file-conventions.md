> **English** · [简体中文](../zh/file-conventions.md)

# File conventions

Every page file is scanned at build/dev time and translated into React Router
`RouteObject`s. This page documents exactly which file means which route — the
rules below are implemented in `src/core/tree.ts` and
`src/codegen/generateRouteRecords.ts`.

## 1. The mental model

A routes folder is turned into a **tree of segments**:

- a **directory** is a path segment (unless it is a route group, see §6),
- a **file** inside it is a leaf route for one more segment,
- an **`index` file** is the “default content” of its parent path,
- a **file named exactly like its directory** (e.g. `blog.tsx` next to
  `blog/`) is the *layout component* of that directory’s path segment,
- with `layoutFile: 'layout'` enabled, a **`layout.tsx`** inside a directory is
  also that path segment’s layout component (§4d),
- with `dotNesting: true` enabled, **dots** in file names expand into nested
  static path segments (§5b),
- **optional parameter files** of the form `[[x]]` are split into two records —
  a “no-param route” plus a “param route” (§5c).

Example tree and the routes it generates:

```txt
src/pages/
├── index.tsx            →  index route at the top level        →  /
├── about.tsx            →  static leaf                          →  /about
├── users/
│   ├── index.tsx        →  index route of users                 →  /users
│   └── [id].tsx         →  dynamic leaf                         →  /users/:id
├── docs/
│   └── [[lang]].tsx     →  optional segment                     →  /docs and /docs/:lang
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
    path: 'docs',
    children: [
      { index: true, lazy: /* docs/[[lang]].tsx — bare /docs */ },
      { path: ':lang', lazy: /* docs/[[lang]].tsx — /docs/:lang */ },
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
  // about.tsx sorts before blog/* docs/* users/* …
]
```

## 2. Segment ↔ path mapping

| On disk             | Meaning                | Generated path / record |
| ------------------- | ---------------------- | ----------------------- |
| `index` (file)      | default content of the parent | an `{ index: true }` **child record** of the parent record (at the top level it matches `/`) |
| `about`             | static segment         | `path: 'about'` |
| `[id]`              | dynamic parameter      | `path: ':id'` |
| `[[lang]]` (file)   | optional parameter     | split into two records: an `{ index: true }` of the parent path + a `path: ':lang'` of the same file (both URLs lazy-load the same module) |
| `[[...rest]]` (file)| optional catch-all     | split into two records: an `{ index: true }` of the parent path + a `path: '*'` of the same file |
| `[...rest]`         | catch-all              | `path: '*'` (only valid as a **file**; the splat value lands in `params['*']`) |
| `(admin)`           | pathless **group**     | no `path` property at all |
| `a.b` (default)     | dot is a literal character | `path: 'a.b'` |
| `users.create` (`dotNesting: true`) | dots expand into nested static segments | `/users/create` (no component/layout for the middle segments) |

Parameter and group names accept `[A-Za-z0-9_-]` (regex `[\w-]+`).

### Segment validation (hard errors)

While scanning, the plugin throws with a helpful message when a name cannot be
expressed with React Router path syntax:

| Input | Why |
| --- | --- |
| `[[id]]` (as a **directory** name) | optional segments are files only; for an optional directory, split into a `[lang]` directory or do it manually |
| `[id]+` (repeatable) | React Router cannot express it; a catch-all file `[...rest]` is the closest match |
| `prefix-[id]`, `[a][b]`, `x_[id]` (partial/multi params) | React Router params must occupy a whole segment |
| `(name).tsx` (group file) | groups are directories; use `(name)/index.tsx` for a pathless layout |
| directory named `[...x]` | catch-alls must be files (use `[...x].tsx` inside a directory) |
| directory named `index` | put an `index` file inside the parent instead |
| static segment containing `:` `*` `?` | conflicts with React Router path syntax |
| `a..b`, `users.[id]` under `dotNesting` | both sides of a dot must be non-empty static names; params/splats/groups must be whole segments |

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

There are four ways to create shared UI, all of them require an explicit
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
directory whenever the two appear together during the scan.

### 4b. Pathless route group layout

```txt
src/pages/(shop)/
├── index.tsx     # layout component of the (shop) group
├── cart.tsx      # /cart
└── checkout.tsx  # /checkout
```

Route groups do not add URL segments, so the group’s `index.tsx` is a
**pathless layout**: `/cart` renders `(shop)/index.tsx` (with `<Outlet/>`)
wrapping `cart.tsx`, while the URL stays `/cart`.

### 4c. No layout at all

Directories without an `index` and without a same-name file are pure
organisational namespaces that contribute their path segment(s) to the URL:

```txt
src/pages/docs/
└── [slug].tsx     # /docs/:slug, no layout wrapper
```

A group used purely for organisation belongs to the same category:

```txt
src/pages/(admin)/
└── dashboard.tsx  # /dashboard — (admin) contributes no segment and no layout
```

### 4d. Layout special file (`layoutFile` option, opt-in)

With `layoutFile: 'layout'` enabled, a `layout.tsx` in every directory becomes
that path segment’s layout component — an alternative to 4a’s “same-name file”
(their simultaneous presence is an error):

```ts
// vite.config.ts
reactRouter({
  layoutFile: 'layout',
})
```

```txt
src/pages/
├── layout.tsx        # root layout (pathless wrapper): wraps everything below (incl. /)
├── blog/
│   ├── layout.tsx    # layout of the blog segment (no blog.tsx needed)
│   ├── index.tsx     # /blog
│   └── [slug].tsx    # /blog/:slug
└── about.tsx         # /about (rendered in the root layout.tsx <Outlet/>)
```

Rules:

- A root-level `layout.tsx` generates a **pathless top-level route**; every
  other route (including the `/` index route) renders as its child (needs an
  `<Outlet/>`);
- while enabled, `layout` is a reserved name: no plain static `/layout` page is
  possible; to use that file name as a page, turn the option off or use a route
  group;
- consistent with 4a semantics, a `(group)/index.tsx` pathless layout can still
  be used alongside a path-segment `layout.tsx`.

## 5. Dynamic segments, optional params, catch-alls and dot-nesting

### 5a. Dynamic segments and catch-alls

```txt
src/pages/
├── products/
│   └── [sku].tsx          # /products/:sku
├── catalog/
│   └── [...rest].tsx      # /catalog/*  (any remaining path)
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
- A catch-all file cannot contain children and cannot be a directory.
- Among sibling records the catch-all is always emitted **last** (React Router
  ranks it lowest anyway; we keep the output deterministic).

### 5b. Dot-nesting (`dotNesting: true`, opt-in)

When enabled, dots in file names expand into **nested static path segments**
(no UI nesting and no layout is created):

```ts
reactRouter({ dotNesting: true })
```

```txt
src/pages/
├── settings.profile.tsx     # /settings/profile —— one leaf route, no middle layout
└── admin.users.index.tsx    # /admin/users —— the last segment is an index
```

Rules:

- Both sides of a dot must be **non-empty static names** (plain Unicode
  characters are fine beyond `[A-Za-z0-9_-]`, but `:` `*` `?` `[` `]` `(` `)`
  are not allowed);
- params/catch-alls/groups must stay whole segments: write `users/[id].tsx`,
  not `users.[id].tsx`;
- conflicts with a same-path directory/same-name file follow the existing
  rules (Duplicate layout, etc.);
- with the option off, dots are literal characters: `a.b.tsx` → `/a.b`
  (v0.1 behaviour).

### 5c. Optional parameters `[[x]]` (file level)

`[[lang]].tsx` (or `[[...rest]].tsx`) means this path segment is **optional**:
the plugin automatically splits it into two routes that both lazy-load the
same module:

```txt
src/pages/docs/
└── [[lang]].tsx
```

This is equivalent to:

```js
{
  path: 'docs',
  children: [
    { index: true, lazy: /* docs/[[lang]].tsx — /docs */ },
    { path: ':lang', lazy: /* docs/[[lang]].tsx — /docs/:lang */ },
  ],
}
```

Rules:

- **Files only**: `[[lang]]` as a directory name is an error;
- when the directory already has an `index.tsx`, a `[[lang]].tsx` cannot be
  added (the no-param URL is already taken by the index) → Duplicate index
  error;
- `[[x]]` next to `[x]` (same directory) is a conflicting error;
- an optional file’s `export const route` may only carry `handle` (`path`/
  `caseSensitive` are ambiguous there and are rejected, see
  [Route modules](route-modules.md)).

## 6. Route groups `(name)`

- A group contributes **no path segment**.
- With `(name)/index.tsx` the group is a pathless **layout** (4b).
- Without an index the group is transparent: its children are collected under a
  component-less pathless record (renders through, see the §3 note).
- A group inside a group, and groups mixed with regular directories, work
  recursively.

```txt
src/pages/
├── (auth)/
│   ├── layout.tsx?  # ✗ not special by default — (auth)/index.tsx is the group layout
│   └── login.tsx    # /login
└── (docs)/
    ├── index.tsx    # pathless layout for /guides, /reference
    ├── guides.tsx   # /guides
    └── reference.tsx# /reference
```

> With `layoutFile` enabled, `(name)/layout.tsx` can also act as the group
> layout, but it cannot coexist with `(name)/index.tsx` (both would claim the
> group’s pathless layout).

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
- Per-folder `extensions` / `exclude` / `filePatterns` override the global
  ones (functions can extend the global value instead of replacing it).
- `exclude` globs are **relative to each folder's `src`** (picomatch syntax),
  e.g. `['**/ignored/**']`.
- `filePatterns` (optional) is a **positive** filter: when given, only files
  matching any of its globs are treated as page files (matched against the
  relative path, including the extension). E.g.
  `{ src: 'src/pages', filePatterns: ['**/*.page.tsx'] }` only treats
  `.page.tsx` files as pages. An empty array is an error (nothing would match).

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
- the catch-all always last,
- records promoted to the top level by an absolute `path` override are sorted
  by their path string.

The same page file set always yields byte-identical output (verified by a unit
test), which keeps snapshots and diffs stable.

## 10. Comparison with unplugin-vue-router naming

| unplugin-vue-router (Vue) | unplugin-react-router (this plugin) | Notes |
| --- | --- | --- |
| `index.vue` → path `''` | `index.tsx` → `{ index: true }` child | same “default content” semantics |
| `users.vue` + `users/` nesting | `users.tsx` + `users/` → layout | layout needs `<Outlet/>` |
| `[id].vue` | `[id].tsx` | same |
| `[...path].vue` → `/:path(.*)` | `[...rest].tsx` → `'*'` | param name differs (`'*'`) |
| `[[id]].vue` (optional) | `[[id]].tsx` → split into an index + a `:id` record | React Router has no optional-segment syntax; expressed via the split |
| `[id]+.vue` (repeatable) | ❌ not supported | React Router cannot express it |
| `prefix-[id].vue` (partial) | ❌ not supported | params must occupy a whole segment |
| `(group)/` directories | `(group)/` directories | a group `index` here means layout, not default content |
| `users.create.vue` (dot-nesting, Nuxt style) | dots kept literally by default; with `dotNesting: true` they expand to `/users/create` | React Router has no path-level components, so only UI-less expansion is possible |
| named views `index@aux.vue` | ❌ not supported | no Vue named views in React Router |
| `<route>` block / `definePage` | module named exports + `export const route` overrides | see [Route modules](route-modules.md) |
| route **names** + typed router | no names; a `AppRoutePath`/`RouteParams` type surface instead | React Router has no named routes |

## 11. Playground example

The repository playground (`playground/src/pages`) exercises the conventions —
index, param, catch-all, group layout, organisation-only group, same-name
layout — and the unit tests / SSR end-to-end fixtures (`tests/fixtures/`)
additionally cover optional params (`[[chapter]]`), `path` overrides, a root
`layout.tsx` and dot-nested pages: they are the freshest runnable references.

## 12. Declarative layouts (v0.3, `layouts` option)

Layout components live outside `pages` (e.g. `src/app/`) and pages stay flat in
`src/pages`, declaring which layout wraps them in code — the React counterpart
of the Vue `definePage`/layouts model.

```ts
// vite.config.ts
reactRouter({
  layouts: { dir: 'src/app', default: 'blank' },
})
```

```txt
src/app/                  # layout directory (relative to root; may nest freely)
├── blank.tsx             # default shell: pages without a declaration end up here
├── admin.tsx             # a named shell
└── components/           # skipped — .tsx files here are never layouts
src/pages/                # pages stay flat / grouped as usual
├── login.tsx             # undeclared → automatically inside the blank shell
└── dashboard.tsx         # declares layout:'admin' → moved into the admin shell
```

Rules:

- **Enabling & default**: providing `layouts` turns the mode on; the `dir`
  directory must exist and a layout file named after `default` (`blank`) must
  be discoverable under it, otherwise build-time errors.
- **Discovery**: layout files are looked up by **file name = layout id**
  (`<id>.tsx`/`.jsx`) at **any depth** under `dir`; directories named
  `components`, dot-prefixed and underscore-prefixed directories are skipped;
  duplicate ids error.
- **Default shell**: every **top-level member** without a `route.layout`
  declaration (top-level page files, top-level directory/group blocks, the
  root `index.tsx`, the `[...rest]` 404) is aggregated into the `default`
  shell.
- **Shell swap**: a page declaring `export const route = { layout: 'admin' }`
  is moved out of the default shell into a sibling `admin` shell (pages of the
  same layout share one lazy-loaded shell). URLs/params/`handle` are
  unchanged.
- **Granularity & mixing**: layout declarations apply per *top-level member* —
  every page inside one top-level directory block must agree (all undeclared →
  default; all the same layout → that layout). Mixed blocks error at build
  time (split into separate top-level files or route groups).
- **Mutually exclusive with directory layouts**: while `layouts` is on,
  directories no longer imply layouts — same-name directory layouts (§4a),
  group index shells (§4b) and `layoutFile` (§4d) are rejected with guidance;
  plain `index.tsx` "default content" pages are unaffected.
- **Page syntax**: `RouteConfig.layout?: string` — same build-time static
  extraction as `path`/`caseSensitive`; inert when `layouts` is not enabled.

```tsx
// src/pages/dashboard.tsx
export const route = { layout: 'admin' }
export default function Dashboard() { … }
```

> Layout components in `src/app` are plain React components rendering an
> `<Outlet/>` for the wrapped page; do not place layout files under
> `src/pages`.
