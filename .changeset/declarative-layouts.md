---
'unplugin-react-router': minor
---

**v0.3 — declarative layout binding (`layouts` option)**

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
