import { describe, expect, it } from 'vitest'
import { extractRouteConfig } from '../src/core/routeConfig'

const FILE = 'src/pages/x.tsx'

describe('extractRouteConfig', () => {
  it('extracts a plain literal config', () => {
    const source = `
      export const route = { path: '/member/:id', caseSensitive: true, handle: { crumb: 'User' } }
      export default function Page() { return null }
    `
    expect(extractRouteConfig(source, FILE)).toEqual({
      path: '/member/:id',
      caseSensitive: true,
      handle: { crumb: 'User' },
    })
  })

  it('returns undefined when there is no route config', () => {
    const source = `
      const route = { path: '/x' }
      export default function Page() { return null }
    `
    expect(extractRouteConfig(source, FILE)).toBeUndefined()
  })

  it('skips occurrences inside strings, templates and comments', () => {
    const source = `
      const copy = 'export const route = { path: "/fake" }'
      const tpl = \`export const route = { path: '/fake2' }\`
      // export const route = { path: '/fake3' }
      /* export const route = { path: '/fake4' } */
      export const route = { handle: { ok: true } }
      export default function Page() { return null }
    `
    expect(extractRouteConfig(source, FILE)).toEqual({ handle: { ok: true } })
  })

  it('ignores other exports named route-ish', () => {
    const source = `
      export const routeList = [{ a: 1 }]
      export const route = { caseSensitive: false }
      export default function Page() { return null }
    `
    expect(extractRouteConfig(source, FILE)).toEqual({ caseSensitive: false })
  })

  it('supports multiline, quoted keys, arrays and nested objects', () => {
    const source = `
      export const route = {
        'path': '/p',
        handle: {
          breadcrumb: ['Home', 'Detail'],
          meta: { title: 'X', visible: true, count: 3, nil: null },
        },
      }
    `
    expect(extractRouteConfig(source, FILE)).toEqual({
      path: '/p',
      handle: {
        breadcrumb: ['Home', 'Detail'],
        meta: { title: 'X', visible: true, count: 3, nil: null },
      },
    })
  })

  it('tolerates trailing satisfies / as const suffixes', () => {
    const source = `
      export const route = { path: '/ok' } satisfies import('unplugin-react-router/routes').RouteConfig;
      export default function Page() { return null }
    `
    expect(extractRouteConfig(source, FILE)).toEqual({ path: '/ok' })
  })

  it('rejects non-object route exports', () => {
    expect(() =>
      extractRouteConfig('export const route = "/x"\n', FILE)
    ).toThrow(/must be an object literal/)
  })

  it('rejects computed values', () => {
    expect(() =>
      extractRouteConfig(
        `const id = 'x'
         export const route = { path: '/p/' + id }\n`,
        FILE
      )
    ).toThrow() // concatenation is not a literal → hard error
    expect(() =>
      extractRouteConfig('export const route = { handle: makeHandle() }\n', FILE)
    ).toThrow(/unsupported expression/)
    expect(() =>
      extractRouteConfig('export const route = { path: \`/p/\${id}\` }\n', FILE)
    ).toThrow(/unexpected character/)
  })

  it('rejects unknown keys and bad value types with file context', () => {
    expect(() =>
      extractRouteConfig('export const route = { pathname: "/x" }\n', FILE)
    ).toThrow(/unknown key "pathname"/)
    expect(() =>
      extractRouteConfig('export const route = { caseSensitive: "yes" }\n', FILE)
    ).toThrow(/"caseSensitive" must be a boolean/)
    expect(() =>
      extractRouteConfig('export const route = { path: "" }\n', FILE)
    ).toThrow(/"path" must be a non-empty string/)
  })

  it('rejects duplicate route configs', () => {
    expect(() =>
      extractRouteConfig(
        `export const route = { handle: {} }
         export const route = { path: '/x' }\n`,
        FILE
      )
    ).toThrow(/duplicate `export const route`/)
  })

  it('rejects trailing commas handling and unquoted dashes correctly', () => {
    const source = `
      export const route = {
        path: '/a-b',
        handle: { key: 'value', },
      }
    `
    expect(extractRouteConfig(source, FILE)).toEqual({
      path: '/a-b',
      handle: { key: 'value' },
    })
  })
})
