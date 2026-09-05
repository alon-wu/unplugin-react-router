> **English** · [简体中文](../zh/testing.md)

# Testing & contributing

## Test suites

Tests run on Node (`vitest`, no DOM) and cover four layers:

| File | What it verifies |
| --- | --- |
| `tests/tree.test.ts` | segment parsing, validation errors, tree insertion, splat/index/duplicate rules |
| `tests/generateRouteRecords.test.ts` | codegen output shape: index/param/splat records, same-name layout merging, pathless groups, determinism |
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

## Run the checks

```bash
pnpm install

pnpm test         # vitest run — all four suites
pnpm typecheck    # tsc --noEmit for the plugin source
pnpm build        # tsup: dist/{index,vite}.{js,cjs,d.ts}

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
- New option → assert the resolution in a small test under `tests/`, and
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
