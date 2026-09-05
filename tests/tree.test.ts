import { describe, expect, it } from 'vitest'
import {
  addFileToTree,
  createRootNode,
  parseDirSegment,
  parseFileSegment,
  validateTreeConfig,
  type TreeNode,
} from '../src/core/tree'

describe('segment parsing', () => {
  it('maps [id] to :id and [...rest] to *', () => {
    expect(parseFileSegment('[id]', 'x.tsx').pathSegment).toBe(':id')
    expect(parseFileSegment('[...rest]', 'x.tsx').pathSegment).toBe('*')
    expect(parseFileSegment('about', 'x.tsx').pathSegment).toBe('about')
    expect(parseFileSegment('a-b_c.d', 'x.tsx').pathSegment).toBe('a-b_c.d')
  })

  it('makes (name) pathless', () => {
    expect(parseDirSegment('(admin)', 'x.tsx').pathSegment).toBe('')
  })

  it('rejects optional, partial and repeatable params as raw segments', () => {
    // optional segments are only valid as *files* (they are split by the caller)
    expect(() => parseFileSegment('[[id]]', 'x.tsx')).toThrow(
      /optional segments must be handled by the caller/
    )
    expect(() => parseDirSegment('[[id]]', 'x.tsx')).toThrow(
      /optional segments .* cannot be directories/
    )
    expect(() => parseFileSegment('prefix-[id]', 'x.tsx')).toThrow(/unsupported segment/)
    expect(() => parseFileSegment('[a][b]', 'x.tsx')).toThrow(/unsupported segment/)
    expect(() => parseFileSegment('[id]+', 'x.tsx')).toThrow(/unsupported segment/)
  })

  it('rejects splat directories and index directories', () => {
    expect(() => parseDirSegment('[...rest]', 'x.tsx')).toThrow(/cannot be directories/)
    expect(() => parseDirSegment('index', 'x.tsx')).toThrow(/cannot be named "index"/)
  })

  it('rejects a group used as a file name', () => {
    expect(() => parseFileSegment('(admin)', 'x.tsx')).toThrow(/must be directories/)
  })

  it('rejects structural characters in static segments', () => {
    expect(() => parseFileSegment('a:b', 'x.tsx')).toThrow(/conflict with React Router/)
    expect(() => parseFileSegment('a*b', 'x.tsx')).toThrow(/conflict with React Router/)
  })
})

describe('tree insertion', () => {
  it('merges a same-named file into its directory as a layout', () => {
    const root = createRootNode()
    addFileToTree(root, [], 'blog', '/p/blog.tsx')
    addFileToTree(root, ['blog'], '[slug]', '/p/blog/[slug].tsx')
    const blog = root.children.get('blog')!
    expect(blog.file).toBe('/p/blog.tsx')
    expect(blog.children.get('[slug]')!.file).toBe('/p/blog/[slug].tsx')
  })

  it('registers index files on their directory node', () => {
    const root = createRootNode()
    addFileToTree(root, [], 'index', '/p/index.tsx')
    addFileToTree(root, ['users'], 'index', '/p/users/index.tsx')
    expect(root.indexFile).toBe('/p/index.tsx')
    expect(root.children.get('users')!.indexFile).toBe('/p/users/index.tsx')
  })

  it('throws when a splat gets children', () => {
    const root = createRootNode()
    addFileToTree(root, [], '[...rest]', '/p/[...rest].tsx')
    expect(() => addFileToTree(root, ['[...rest]'], 'x', '/p/x.tsx')).toThrow(
      /cannot contain children/
    )
  })
})

describe('optional parameters [[x]]', () => {
  it('splits [[id]].tsx into an index route plus a :id route (same module)', () => {
    const root = createRootNode()
    addFileToTree(root, ['users'], '[[id]]', '/p/users/[[id]].tsx')
    const users = root.children.get('users')!
    expect(users.indexFile).toBe('/p/users/[[id]].tsx')
    const param = users.children.get('[id]')!
    expect(param.kind).toBe('param')
    expect(param.pathSegment).toBe(':id')
    expect(param.file).toBe('/p/users/[[id]].tsx')
  })

  it('splits [[...rest]].tsx into an index route plus a splat route', () => {
    const root = createRootNode()
    addFileToTree(root, [], '[[...rest]]', '/p/[[...rest]].tsx')
    expect(root.indexFile).toBe('/p/[[...rest]].tsx')
    expect(root.children.get('[...rest]')!.kind).toBe('splat')
  })

  it('rejects an optional file next to an explicit index file', () => {
    const root = createRootNode()
    addFileToTree(root, ['users'], 'index', '/p/users/index.tsx')
    expect(() =>
      addFileToTree(root, ['users'], '[[id]]', '/p/users/[[id]].tsx')
    ).toThrow(/Duplicate index file/)
  })

  it('rejects config overrides that are ambiguous on optional files', () => {
    const root = createRootNode()
    expect(() =>
      addFileToTree(
        root,
        [],
        '[[id]]',
        '/p/[[id]].tsx',
        undefined,
        { path: '/x' }
      )
    ).toThrow(/only supported on leaf page files/)
    expect(() =>
      addFileToTree(
        root,
        [],
        '[[id]]',
        '/p/[[id]].tsx',
        undefined,
        { caseSensitive: true }
      )
    ).toThrow(/ambiguous on an optional segment file/)
  })
})

describe('dot nesting (opt-in)', () => {
  it('splits users.create.tsx into nested static segments without UI nesting', () => {
    const root = createRootNode()
    addFileToTree(
      root,
      [],
      'users.create',
      '/p/users.create.tsx',
      { dotNesting: true }
    )
    const users = root.children.get('users')!
    expect(users.kind).toBe('static')
    expect(users.file).toBeNull()
    const create = users.children.get('create')!
    expect(create.file).toBe('/p/users.create.tsx')
    expect(create.pathSegment).toBe('create')
  })

  it('treats dots literally when dot-nesting is off', () => {
    const root = createRootNode()
    addFileToTree(root, [], 'users.create', '/p/users.create.tsx')
    expect(root.children.get('users.create')!.pathSegment).toBe('users.create')
  })

  it('supports a trailing index segment (users.profile.index.tsx)', () => {
    const root = createRootNode()
    addFileToTree(
      root,
      [],
      'users.profile.index',
      '/p/users.profile.index.tsx',
      { dotNesting: true }
    )
    const users = root.children.get('users')!
    const profile = users.children.get('profile')!
    expect(profile.indexFile).toBe('/p/users.profile.index.tsx')
  })

  it('rejects structural segments inside dot names', () => {
    const root = createRootNode()
    // names containing "[" never reach the dot expansion — they are rejected
    // as unsupported segments
    expect(() =>
      addFileToTree(root, [], 'users.[id]', '/p/x.tsx', { dotNesting: true })
    ).toThrow(/unsupported segment/)
    expect(() =>
      addFileToTree(root, [], 'a..b', '/p/x.tsx', { dotNesting: true })
    ).toThrow(/empty segments/)
  })
})

describe('layout special file (layoutFile option)', () => {
  it('turns layout.tsx inside a folder into that folder layout', () => {
    const root = createRootNode()
    addFileToTree(root, ['blog'], 'layout', '/p/blog/layout.tsx', {
      layoutFileName: 'layout',
    })
    const blog = root.children.get('blog')!
    expect(blog.file).toBe('/p/blog/layout.tsx')
    expect(blog.children.has('layout')).toBe(false)
  })

  it('turns a root layout.tsx into the root layout (pathless wrapper)', () => {
    const root = createRootNode()
    addFileToTree(root, [], 'layout', '/p/layout.tsx', {
      layoutFileName: 'layout',
    })
    expect(root.file).toBe('/p/layout.tsx')
  })

  it('treats layout.tsx as a plain page when layoutFile is disabled', () => {
    const root = createRootNode()
    addFileToTree(root, ['blog'], 'layout', '/p/blog/layout.tsx')
    expect(root.children.get('blog')!.children.get('layout')!.file).toBe(
      '/p/blog/layout.tsx'
    )
  })

  it('throws on duplicate layouts', () => {
    const root = createRootNode()
    addFileToTree(root, ['blog'], 'layout', '/p/blog/layout.tsx', {
      layoutFileName: 'layout',
    })
    expect(() =>
      addFileToTree(root, ['blog'], 'layout', '/p/other/layout.tsx', {
        layoutFileName: 'layout',
      })
    ).toThrow(/Duplicate layout file/)
  })
})

describe('route config (export const route)', () => {
  it('attaches the config to the leaf file node', () => {
    const root = createRootNode()
    addFileToTree(
      root,
      ['users'],
      '[id]',
      '/p/users/[id].tsx',
      undefined,
      { path: '/member/:id', caseSensitive: true, handle: { crumb: 'u' } }
    )
    const node = root.children.get('users')!.children.get('[id]')!
    expect(node.fileConfig).toEqual({
      path: '/member/:id',
      caseSensitive: true,
      handle: { crumb: 'u' },
    })
  })

  it('rejects a path override on index and layout files', () => {
    const root = createRootNode()
    expect(() =>
      addFileToTree(root, [], 'index', '/p/index.tsx', undefined, {
        path: '/home',
      })
    ).toThrow(/only supported on leaf page files/)
    const root2 = createRootNode()
    addFileToTree(root2, [], 'blog', '/p/blog.tsx')
    expect(() =>
      addFileToTree(root2, ['blog'], '[x]', '/p/blog/[x].tsx', undefined)
    ).not.toThrow()
    const root3 = createRootNode()
    expect(() =>
      addFileToTree(root3, [], 'blog', '/p/blog.tsx', undefined, {
        path: '/override',
      })
    ).not.toThrow() // at insert time blog may still become a layout; final check below
  })

  it('enforces layout placement after the tree is complete', () => {
    // blog.tsx is inserted first as a leaf with a path override, then blog/
    // shows up → blog becomes a layout → the override must now fail.
    const root = createRootNode()
    addFileToTree(root, [], 'blog', '/p/blog.tsx', undefined, {
      path: '/override',
    })
    addFileToTree(root, ['blog'], 'index', '/p/blog/index.tsx')
    expect(() => validateTreeConfig(root)).toThrow(/only supported on leaf page files/)
  })

  it('rejects a caseSensitive override on an index route', () => {
    const root = createRootNode()
    expect(() =>
      addFileToTree(root, ['x'], 'index', '/p/x/index.tsx', undefined, {
        caseSensitive: true,
      })
    ).toThrow(/cannot apply to an index route/)
  })

  it('rejects mixing a layout file and an index layout in a route group', () => {
    const root = createRootNode()
    addFileToTree(root, ['(auth)'], 'layout', '/p/(auth)/layout.tsx', {
      layoutFileName: 'layout',
    })
    addFileToTree(root, ['(auth)'], 'index', '/p/(auth)/index.tsx')
    expect(() => validateTreeConfig(root)).toThrow(/cannot combine a layout file/)
  })
})
