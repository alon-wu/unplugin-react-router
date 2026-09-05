> **English** · [简体中文](../zh/testing.md)

# Testing & contributing

## Test suites

Tests run on Node (`vitest`, no DOM) and cover seven suites:

| File | What it verifies |
| --- | --- |
| `tests/tree.test.ts` | segment parsing, validation errors, tree insertion, splat/index/duplicate rules; v0.2: optional-param `[[x]]`/`[[...x]]` split, dot-nesting, `layout.tsx` (`layoutFile`) and placement validation of `export const route` |
| `tests/routeConfig.test.ts` | source-level static extraction of `export const route`: plain-literal parsing, skipping strings/templates/comments, errors for non-objects, computed values, unknown keys and duplicate exports |
| `tests/generateRouteRecords.test.ts` | codegen output shape: index/param/splat records, same-name layout merging, pathless groups, determinism; v0.2: path/caseSensitive/handle overrides, optional-param split, root `layout.tsx`, dot-nesting output |
| `tests/typedSurface.test.ts` | reachable-URL collection (each path with its param keys, deterministic ordering) and `typed-routes.d.ts` type-surface generation (valid surface for an empty tree too) |
| `tests/plugin.test.ts` | v0.2 option resolution (`layoutFile`/`filePatterns` validation and per-folder resolution), filePatterns-filtered scanning, Vite plugin dev-server wiring (watcher-triggered reload, `watch: 'polling'` scanner) |
| `tests/watch.test.ts` | `attachPageWatcher` add/unlink filtering, exclude handling, detach behaviour |
| `tests/runtime.test.ts` | **end-to-end**: plugin scans a fixture folder → executes the generated virtual module → React Router v8 **static router** renders real URLs (loaders, boundaries, layouts) |

The e2e suite is the strongest signal: it exercises the exact code path a user
hits (scan → codegen → `routes` → `createStaticHandler`/`createStaticRouter` →
`renderToString`) against the installed `react-router@8`.

### URLs covered by the e2e suite (fixtures under `tests/fixtures/pages/`)

| URL | Expected text | What it proves |
| --- | --- | --- |
| `/` | `HOME` | top-level `index: true` route |
| `/about` | `ABOUT` | static leaf |
| `/users` | `USERS` | directory index route |
| `/users/42` | `USER 42` | dynamic `:id`, lazy loader ran, data injected |
| `/users/bad` | `USER-ERROR` | page `ErrorBoundary` from a loader `Response` 404 |
| `/blog` | `BLOG-LAYOUT` + `BLOG-INDEX` | same-name file layout + index child |
| `/blog/some-post` | `BLOG-LAYOUT` + `POST some-post` | layout + lazy loader under it |
| `/cart` | `SHOP-LAYOUT` + `CART` | pathless group layout (`(shop)/index.tsx`) |
| `/dashboard` | `DASHBOARD` | organisation-only group (component-less pathless) |
| `/unknown-path` | `NOTFOUND` | `[...rest].tsx` splat |
| `/docs`, `/docs/hello` | `CHAPTER` | optional `[[chapter]].tsx`: both the bare and the param URL hit the same module (split into two records) |

The remaining v0.2 capabilities are covered by dedicated fixture folders +
options:

- `overrides-pages/members/[id].tsx` rewrites its URL to `/user/:id` through
  `export const route` (promoted to the top level): `/user/7` renders `MEMBER`,
  while the original `/members/7` no longer matches;
- `layout-pages/` + `layoutFile: 'layout'`: the root `layout.tsx` becomes a
  pathless top-level wrapper — both `/` and `/about` contain `ROOT-LAYOUT`;
- `dot-pages/settings.profile.tsx` + `dotNesting: true`: `/settings/profile`
  renders `SETTINGS-PROFILE`.

## Run the checks

```bash
pnpm install

pnpm test         # vitest run — all seven suites
pnpm typecheck    # tsc --noEmit for the plugin source
pnpm build        # tsup: dist/{index,vite,webpack,rollup,esbuild}.{js,cjs,d.ts}

# playground
pnpm dev          # vite dev on playground/src/pages
pnpm -C playground build
```

`pnpm test` is intentionally dependency-light (no jsdom/happy-dom): the e2e
suite uses React Router's static router + `react-dom/server`, so it runs in
plain Node.

## Playground as the manual reference

`playground/src/pages/` mirrors every convention (index, `[id]`, `[...rest]`,
group layout, organisation-only group, same-name layout). It is wired to the
plugin **source** (`playground/vite.config.ts` imports `../src/vite.ts`), so no
build step is needed before `pnpm dev`; plugin edits apply on restart.

## How to add coverage

- New file convention → extend `tests/tree.test.ts` (parse/insert) and
  `tests/generateRouteRecords.test.ts` (output shape), then add a fixture page
  + a row in `tests/runtime.test.ts`'s `it.each` table for the behavioural
  guarantee.
- New option → assert its resolution/wiring in `tests/plugin.test.ts`, and
  document it in `docs/api.md`.
- Snapshot tests for full generated modules are intentionally avoided in v0.1
  (fixture paths are machine-specific); assertions target structural pieces
  (`path`, `index: true`, import specifiers, determinism).

## Contribution guidelines

- Keep runtime dependencies zero/minimal; prefer plain Node APIs.
- Keep codegen pure (tree → string) so it stays snapshot-testable.
- Update the docs (`docs/`) together with behaviour changes; the docs are
  written against the implementation and should stay truthful (see the Known
  limitations sections).
- `pnpm typecheck` and `pnpm test` must pass before committing.
