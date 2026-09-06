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
| `tests/layouts.test.ts` | **v0.3 declarative layouts**: `layouts` option parsing/validation (missing dir/default, invalid ids), recursive layout discovery (deep default, `components` skipped, duplicates), default-shell + declared-shell generation grouping, implicit directory layouts rejected, mixed top-level blocks rejected, inert `layout` without the option |

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

v0.3 declarative layouts additionally have a dedicated SSR fixture project
`layouts-app/` (`app/` holds `blank.tsx`/`admin.tsx`, `pages/` holds pages):

- undeclared pages (`/`, `/login`, `/users/:id`) render `BLANK-SHELL` plus
  their content;
- `/dashboard` (declaring `export const route = { layout: 'admin' }`) renders
  `ADMIN-SHELL` and **not** `BLANK-SHELL` (shell-swap check).

## Run the checks

```bash
pnpm install

pnpm test         # vitest run — all seven suites
pnpm test:e2e     # Playwright — real-browser acceptance (starts/stops vite)
pnpm typecheck    # tsc --noEmit for the plugin source
pnpm build        # tsup: dist/{index,vite,webpack,rollup,esbuild}.{js,cjs,d.ts}

# playground
pnpm dev          # vite dev on playground/src/pages
pnpm -C playground build
```

`pnpm test` is intentionally dependency-light (no jsdom/happy-dom): the e2e
suite uses React Router's static router + `react-dom/server`, so it runs in
plain Node.

## Browser E2E (Playwright, v0.2/v0.3)

Two dedicated fixture Vite apps, started/stopped automatically by
`playwright.config.ts` (two projects, one port + spec each):

- **`tests/e2e-app/`** (port 5202, project `app`): the v0.2 capability matrix —
  `dotNesting` + `layoutFile` enabled, plus a `filePatterns` folder and a
  parameterised-prefix folder; `tests/e2e/e2e.spec.ts` asserts 16 criteria:
  base conventions (index/static/dynamic/same-name layout/group/404), v0.2
  features (root `layout.tsx`, optional `[[chapter]]`, absolute `path`
  override incl. the original path no longer matching, dot nesting,
  `filePatterns`, parameterised prefixes) and dev-mode structural HMR (adding a
  page file makes it reachable without a restart; removing retires it — 15 s
  polling budget per case).
- **`tests/e2e-layouts-app/`** (port 5203, project `layouts`): v0.3 declarative
  layouts; `tests/e2e/layouts.spec.ts` asserts 7 criteria: undeclared pages
  (`/`, `/login`, `/settings`, `/users/*`, 404) render inside the default
  (blank) shell, `/dashboard` (declaring `route.layout = 'admin'`) renders
  inside ADMIN without the BLANK shell, plus **two layout structural-HMR
  cases**: adding a layout file + a page declaring it makes the new shell
  reachable without a restart; deleting a still-referenced layout file makes
  navigation fail with `Failed to fetch dynamically imported module` until the
  layout file is restored.

```bash
pnpm test:e2e                     # full run (both apps; auto-starts vite + browser)
pnpm exec playwright test -- --ui # visual UI mode
pnpm test:e2e -- -g "optional"    # filter by title
pnpm exec playwright test --project=layouts   # layouts app only
```

Local runs reuse the system Chrome (`channel: 'chrome'` in
`playwright.config.ts`, no download); the CI `e2e` job uses the
Playwright-managed Chromium instead (`pnpm exec playwright install --with-deps
chromium`).

`tests/scripts/playground-smoke.mjs` is a smoke script against the real
playground dev server (`127.0.0.1:5173`): start `pnpm dev`, then run
`node tests/scripts/playground-smoke.mjs` — it visits every route, asserts each
page marker and the absence of console/runtime errors, and performs a live
structural-HMR check (adding/removing a page file → route appears/disappears).

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

## Verification record

Snapshot of one full acceptance pass on 2026-09-06 (the v0.3 declarative
layouts delivery); numbers drift across versions — for routine runs use the
commands at the top of this page.

| Item | Result |
| --- | --- |
| `pnpm typecheck` | ✅ `tsc --noEmit` clean |
| `pnpm test` (vitest, 8 suites) | ✅ 87/87: tree 26 · routeConfig 13 · typedSurface 4 · generateRouteRecords 9 · layouts 9 · runtime(SSR) 16 · plugin 7 · watch 3 |
| `pnpm build` | ✅ ESM + CJS + d.ts (5 entries) |
| `pnpm test:e2e` (Playwright/Chrome, two apps) | ✅ 23/23: `app` 16 (base conventions, v0.2 features, dev HMR) + `layouts` 7 (default shell/swapping + 2 layout HMR cases) |
| Consumer-side type check | ✅ throwaway real project: `route.layout` `satisfies RouteConfig`, `LoaderData<typeof loader>` compile under `tsc`; the generated routes contain both `blank`/`admin` shells |
| `pnpm changeset status` | ✅ minor: `unplugin-react-router` |

Boundary behaviour captured while verifying: deleting a layout file that is
still referenced by the in-memory route table makes the next navigation fail
with `Failed to fetch dynamically imported module` in dev; restoring the layout
file (or removing the page referencing it) heals the app — no dev-server
restart needed. The two layout HMR cases in `tests/e2e/layouts.spec.ts` pin
this behaviour.
