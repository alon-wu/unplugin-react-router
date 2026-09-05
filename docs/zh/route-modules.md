> **简体中文** · [English](../en/route-modules.md)

# 路由模块

页面文件（page file）即一个**路由模块**（route module）。生成的 `route.lazy`
加载器会收集它的导出，并将其变为对应 React Router 路由的属性——这是在 React
侧取代 `definePage`/`<route>` 代码块的方案，也是对 `unplugin-vue-router` 的最大
简化。

## 支持的导出

| 导出 | 路由属性 | 说明 |
| --- | --- | --- |
| `default` | `Component` | 页面组件（React Router 将其视为模块默认导出；我们显式映射它） |
| `loader` | `loader` | 渲染前运行；接收 `LoaderFunctionArgs` |
| `action` | `action` | 通过 `<Form>` / `useFetcher` / `useSubmit` 执行变更 |
| `ErrorBoundary` | `ErrorBoundary` | 当路由（或其子路由）抛出错误时渲染 |
| `HydrateFallback` | `HydrateFallback` | 数据路由（data router）初次水合期间显示 |
| `handle` | `handle` | 可通过 `useMatches()` 访问的任意数据 |
| `shouldRevalidate` | `shouldRevalidate` | 选择退出默认的重新验证 |
| `middleware` | `middleware` | ⚠️ **不支持通过页面文件提供**（见下文） |

除此之外导出的任何内容在运行时都会被 React Router 忽略（展开运算符如实保留
模块内容，多余的键不会被赋为路由属性）。

## 完整示例

```tsx
// src/pages/users/[id].tsx
import {
  useLoaderData,
  useParams,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id)
  if (Number.isNaN(id)) throw new Response('Unknown user', { status: 404 })
  return { id }
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData()
  return { ok: true, name: form.get('name') }
}

export const handle = { crumb: 'User' }

export function ErrorBoundary() {
  return <p>This user could not be loaded.</p>
}

export default function User() {
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  const { id } = useParams()
  return (
    <main>
      <h1>User {data.id}</h1>
      <p>param id: {id}</p>
    </main>
  )
}
```

该文件生成的记录如下所示：

```js
{
  path: ':id',
  lazy: async () => {
    const m = await import('/abs/path/src/pages/users/[id].tsx')
    return { Component: m.default, ...m }
  },
}
```

### 为什么是 `{ Component: m.default, ...m }`？

React Router v8 的 **router** 层*不会*自动把懒加载模块的 `default` 导出映射到
`Component` 上——该映射存在于框架（`@react-router/dev`）层，而非 `react-router`
本身（已在 v8 源码中验证：`loadLazyRoute` 直接赋值解析出的模块的键，
`defaultMapRouteProperties` 只转换 `Component`/`HydrateFallback`/`ErrorBoundary`）。
因此，为保证**库/数据模式**（library/data mode）下的健壮性，我们显式把
`default` → `Component` 映射，并转发其余所有导出。无论用户安装哪个 React
Router 版本，这样做都有效。

## 页面模块中的类型

React Router 数据模式下的类型是*按模块*的，而非全局推断：

```ts
// loader return type feeding the component's useLoaderData:
const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
```

这是 React Router 在库模式下的官方写法。该插件不会（在没有自定义路由/类型
注册表的情况下也无法）把 `useLoaderData` 的泛型全局自动接线——这是与
`unplugin-vue-router` 的 typed-router 之间一处有意的差异，详见
[架构 → 类型设计](architecture.md)。

`loader`/`action` 的参数开箱即用即具备完整类型：

```ts
export async function loader({ params, request, context }: LoaderFunctionArgs)
```

## 中间件（页面文件为何无法提供）

React Router 只允许通过 `lazy` 的**对象**形式懒加载 `middleware`
（`lazy: { middleware: async () => (await import('./x')).middleware }`）。而我们
生成的**函数**形式（`lazy: async () => ({...})`）被明确禁止返回 `middleware`
（一个不支持的键——React Router 需要在解析其他懒加载属性*之前*就知道中间件的
存在）。

v0.1 的后果：

- **不要**从页面文件中导出 `middleware`；否则它会被忽略，并在控制台给出警告。
- 如果现在就需要基于中间件的布局/认证，应将其放入手写的路由记录中（之后可
  扩展现成的生成树，或参见 Roadmap）。

## 代码分割行为

每个页面模块都是独立的动态导入，因此 Vite/Rolldown 会为每个页面产出一个
chunk：

```txt
dist/assets/_id_-D3kP9x.js       # users/[id].tsx (component + loader + boundary)
dist/assets/_...rest_-Q2uZ.js    # [...rest].tsx
dist/assets/blog-B0mQ.js         # blog.tsx layout
```

同一页面的组件、loader、action 和错误边界会一起放在同一个 chunk 中——导航时
恰好只下载所需的页面。（更细粒度的"路由模块拆分"（split route modules），即
将 loader 与组件拆开，是未来可能的优化方向。）

## ErrorBoundary 行为说明

- 页面级的 `ErrorBoundary` 会捕获该路由自身 loader/action/渲染过程中抛出的
  错误。
- 由于边界本身也是懒加载的，*在加载页面模块本身*时发生的错误会落到最近的
  祖先边界（或 React Router 默认错误元素）上——如果这对你有影响，请记得在
  生产应用中保留一个顶层边界。

## 无法在单文件中声明的路由对象属性（v0.1）

| 属性 | 目前如何实现 |
| --- | --- |
| `caseSensitive` | 不支持（需要路由级配置） |
| `id` | 由数据路由自动生成；很少需要手动指定 |
| `path` / `index` | 由文件名推导；无法按文件覆盖 |
| `unstable_validateParams` | React Router v8 的参数校验；尚未接入 |

按文件覆盖 `path`（类似 uvr 的 `<route>` 代码块）是未来可能的功能——参见
[Roadmap](architecture.md)。
