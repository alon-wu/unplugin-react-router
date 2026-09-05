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
