# Changesets

This project uses [changesets](https://github.com/changesets/changesets) to
version the package and publish to npm with provenance.

## Workflow

- Run `pnpm changeset` to describe a change (choose `minor` for new features,
  `patch` for fixes).
- Commit the generated markdown file.
- On the default branch, CI runs `changeset version` + `changeset publish`
  (npm provenance requires the `NPM_TOKEN` secret and a publish job that runs
  on `main`).

## Releasing locally (optional)

```bash
pnpm changeset version   # consume pending changesets, bump versions
pnpm build               # rebuild with the bumped version
pnpm changeset publish   # publish to npm
```
