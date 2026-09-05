import { describe, expect, it } from 'vitest'
import { createRootNode, addFileToTree } from '../src/core/tree'
import { generateRouteRecords } from '../src/codegen/generateRouteRecords'

type FileSpec = { dirs: string[]; name: string; file: string }

function buildTree(files: FileSpec[]) {
  const root = createRootNode()
  for (const { dirs, name, file } of files) {
    addFileToTree(root, dirs, name, file)
  }
  return root
}

describe('generateRouteRecords', () => {
  it('generates index, param, splat records', () => {
    const code = generateRouteRecords(
      buildTree([
        { dirs: [], name: 'index', file: '/p/index.tsx' },
        { dirs: ['users'], name: 'index', file: '/p/users/index.tsx' },
        { dirs: ['users'], name: '[id]', file: '/p/users/[id].tsx' },
        { dirs: [], name: '[...rest]', file: '/p/[...rest].tsx' },
      ])
    )
    expect(code).toContain(`index: true`)
    expect(code).toContain(`path: "users"`)
    expect(code).toContain(`path: ":id"`)
    expect(code).toContain(`path: "*"`)
    expect(code).toContain(`import("/p/users/[id].tsx")`)
    expect(code).toContain(`Component: m.default`)
  })

  it('turns a file sharing its folder name into a layout record', () => {
    const code = generateRouteRecords(
      buildTree([
        { dirs: [], name: 'blog', file: '/p/blog.tsx' },
        { dirs: ['blog'], name: 'index', file: '/p/blog/index.tsx' },
        { dirs: ['blog'], name: '[slug]', file: '/p/blog/[slug].tsx' },
      ])
    )
    // blog.tsx is the component of the `blog` segment, index becomes the
    // index child, [slug] a sibling child.
    expect(code).toContain(`path: "blog"`)
    expect(code).toContain(`import("/p/blog.tsx")`)
    expect(code).toContain(`import("/p/blog/index.tsx")`)
    expect(code).toContain(`import("/p/blog/[slug].tsx")`)
  })

  it('keeps (group) folders pathless with an index layout component', () => {
    const code = generateRouteRecords(
      buildTree([
        { dirs: ['(shop)'], name: 'index', file: '/p/(shop)/index.tsx' },
        { dirs: ['(shop)'], name: 'cart', file: '/p/(shop)/cart.tsx' },
      ])
    )
    expect(code).not.toContain(`path: "(shop)"`)
    expect(code).toContain(`import("/p/(shop)/index.tsx")`)
    expect(code).toContain(`path: "cart"`)
  })

  it('is deterministic for the same file set', () => {
    const files: FileSpec[] = [
      { dirs: [], name: 'about', file: '/p/about.tsx' },
      { dirs: ['users'], name: '[id]', file: '/p/users/[id].tsx' },
      { dirs: [], name: 'index', file: '/p/index.tsx' },
    ]
    const a = generateRouteRecords(buildTree(files))
    const b = generateRouteRecords(buildTree([...files].reverse()))
    expect(a).toBe(b)
  })
})

describe('generateRouteRecords — v0.2 additions', () => {
  it('emits path override, caseSensitive and static handle', () => {
    const root = buildTree([{ dirs: ['users'], name: '[id]', file: '/p/users/[id].tsx' }])
    root.children.get('users')!.children.get('[id]')!.fileConfig = {
      path: '/member/:id',
      caseSensitive: true,
      handle: { crumb: 'Member' },
    }
    const code = generateRouteRecords(root)
    expect(code).toContain(`path: "/member/:id"`)
    expect(code).toContain(`caseSensitive: true`)
    expect(code).toContain(`handle: {"crumb":"Member"}`)
  })

  it('renders a root layout.tsx as a pathless wrapper (layoutFile)', () => {
    const root = buildTree([
      { dirs: [], name: 'index', file: '/p/index.tsx' },
      { dirs: [], name: 'about', file: '/p/about.tsx' },
      { dirs: [], name: 'layout', file: '/p/layout.tsx' },
    ])
    // re-insert layout as the root layout via the tree option
    const root2 = createRootNode()
    for (const f of [
      { dirs: [] as string[], name: 'layout', file: '/p/layout.tsx' },
      { dirs: [] as string[], name: 'index', file: '/p/index.tsx' },
      { dirs: [] as string[], name: 'about', file: '/p/about.tsx' },
    ]) {
      addFileToTree(root2, f.dirs, f.name, f.file, { layoutFileName: 'layout' })
    }
    const code = generateRouteRecords(root2)
    void root
    expect(code).toContain(`import("/p/layout.tsx")`)
    // the root index route lives inside the wrapper's children (rendered in
    // its <Outlet/>), so it must still appear as an index record
    expect(code).toContain(`index: true`)
    expect(code).toContain(`import("/p/index.tsx")`)
  })

  it('turns [[id]].tsx into an index record plus a :id record of the same module', () => {
    const root = createRootNode()
    addFileToTree(root, ['users'], '[[id]]', '/p/users/[[id]].tsx')
    const code = generateRouteRecords(root)
    expect(code).toContain(`path: "users"`)
    expect(code).toContain(`index: true`)
    expect(code).toContain(`path: ":id"`)
    const imports =
      code.match(/import\("\/p\/users\/\[\[id\]\]\.tsx"\)/g) ?? []
    expect(imports.length).toBe(2)
  })

  it('nests dot-nested pages without adding a layout', () => {
    const root = createRootNode()
    addFileToTree(root, [], 'users.create', '/p/users.create.tsx', {
      dotNesting: true,
    })
    const code = generateRouteRecords(root)
    expect(code).toContain(`path: "users"`)
    expect(code).toContain(`path: "create"`)
    expect(code).toContain(`import("/p/users.create.tsx")`)
  })

  it('emits a folder layout.tsx (layoutFile) inside the directory record', () => {
    const root = createRootNode()
    addFileToTree(root, ['blog'], 'layout', '/p/blog/layout.tsx', {
      layoutFileName: 'layout',
    })
    addFileToTree(root, ['blog'], 'index', '/p/blog/index.tsx')
    addFileToTree(root, ['blog'], '[slug]', '/p/blog/[slug].tsx')
    const code = generateRouteRecords(root)
    expect(code).toContain(`path: "blog"`)
    expect(code).toContain(`import("/p/blog/layout.tsx")`)
    expect(code).toContain(`import("/p/blog/index.tsx")`)
    expect(code).toContain(`import("/p/blog/[slug].tsx")`)
  })
})
