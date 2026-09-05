import { describe, expect, it } from 'vitest'
import { addFileToTree, createRootNode, parseDirSegment, parseFileSegment } from '../src/core/tree'

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

  it('rejects optional, partial and repeatable params', () => {
    expect(() => parseFileSegment('[[id]]', 'x.tsx')).toThrow(/unsupported segment/)
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
    expect(() => addFileToTree(root, ['[...rest]'], 'x', '/p/x.tsx')).toThrow(/cannot contain children/)
  })
})
