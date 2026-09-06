> **简体中文** · [English](../en/route-modules.md)

# 路由模块

页面文件（page file）即一个**路由模块**（route module）。生成的 `route.lazy`
加载器会收集它的导出，并将其变为对应 React Router 路由的属性——这是在 React
侧取代 `definePage`/`<route>` 代码块的方案。

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
| `route` | ——（构建期） | **路由级覆盖**：`export const route = {…}` 是一个*纯字面量*对象，构建期被读取（见下文） |
| `middleware` | `middleware` | ⚠️ **不支持通过页面文件提供**（见下文） |

除此之外导出的任何内容在运行时都会被 React Router 忽略（展开运算符如实保留
模块内容，多余的键不会被赋为路由属性）。

## 路由级覆盖：`export const route`

React Router **禁止 `lazy` 改变路由的静态字段**（`path`、`caseSensitive`
必须在路由对象上静态存在）。因此想要"按文件覆盖路由"时，插件在**构建期**从
源码中读取一个顶层、纯字面量的 `export const route`：

```tsx
// src/pages/users/[id].tsx —— 磁盘路径 /users/:id
import type { RouteConfig } from 'unplugin-react-router/routes'

export const route = {
  path: '/user/:id', // 绝对路径：把这条路由提升为顶层路由
  caseSensitive: true,
  handle: { crumb: 'User' },
} satisfies RouteConfig

export default function User() {
  return <h1>User</h1>
}
```

### 支持的键与语义

| 键 | 类型 | 语义 |
| --- | --- | --- |
| `path` | `string` | 覆盖该记录生成的路径。**以 `/` 开头 = 绝对 URL**：由于 React Router 不允许子记录使用与其父链不一致的绝对路径，这条路由会被**提升为顶层路由**（它磁盘上的父目录若因此变空则不再生成路由）。不以 `/` 开头 = 覆盖当前记录的相对路径值 |
| `caseSensitive` | `boolean` | 生成的记录带上 `caseSensitive` |
| `handle` | 任意可序列化字面量 | 生成的记录静态带上 `handle`（无需再从模块具名导出 `handle`） |
| `layout` | `string`（v0.3） | **声明式布局绑定**：把该页面所在的**顶层成员**包进 `<layouts.dir>/<layout>.tsx` 壳（替代默认壳）。仅在 `layouts` 选项开启时生效；未开启却写了它不会报错但无效果。布局以顶层成员为粒度：一个顶层目录块内的所有页面必须一致（全部未声明 → 默认壳；全部同一布局 → 该布局壳）。**catch-all 页面（`[...rest].tsx`）不能声明 `layout`**——它必须留在默认壳，避免产生第二个全局兜底 |

> 关于 `layout` 的完整规则（布局目录发现、默认壳、换壳、目录混用报错）见
> [文件约定 → 声明式布局](file-conventions.md)。

规则与限制：

- **必须是纯对象字面量**：值只允许字符串/数字/布尔/null/数组/对象字面量。
  标识符、函数调用、模板串、展开、`+` 拼接等都会被报错（构建期无法静态
  求值）——把需要计算的值放进 `loader`，或直接写成字面量。
- 允许 `satisfies RouteConfig` / `as const` 之类的后缀；允许键加引号、尾逗号。
- 每文件最多一个 `export const route`；未知键、键类型错误都会硬报错（带文件
  路径），避免拼写错误被静默忽略。
- `path` 覆盖**只对叶子页面有效**：`index.tsx`、布局文件（同名布局 /
  `layout.tsx`）与可选参数文件（`[[x]]`）的 `path`/`caseSensitive` 语义不明，
  会被拒绝（可选文件只允许 `handle`）。
- 不要在同一个模块里既导出 `handle` 又给 `route.handle` 赋值——前者（运行时）
  会覆盖后者。二选一即可。
- `export const route` 是顶层语句；它不会参与运行时逻辑（模块被懒加载时该
  常量保留在产物里但不会成为路由属性，`lazy` 只把 `Component` 与路由字段
  转发给 React Router）。

> 说明：这是 `unplugin-vue-router` 的 `definePage`/`<route>` 代码块在 React
> 侧的等价物。Vue 用编译宏改写 SFC；这里用"有类型的字面量导出 + 构建期静态
> 提取"，无需引入宏或 Babel 插件。

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

## 类型化路由面（v0.2）

生成的 `typed-routes.d.ts`（默认在项目根）在声明虚拟模块的同时导出由页面树
推导出的类型：

```ts
import type { AppRoutePath, RouteParams, LoaderData } from 'unplugin-react-router/routes'
```

- **`AppRoutePath`** —— 所有可达 URL 的字面量联合：`'/' | '/about' | '/users/:id' | …`。
  可用于 `Link`/`useNavigate` 目标变量、路由表的穷尽匹配等。
- **`RouteParams<P extends AppRoutePath>`** —— 逐路由参数形状：
  ```tsx
  const { id } = useParams<RouteParams<'/users/:id'>>()
  // id: string
  ```
  无参数路径得到 `Record<string, never>`；兜底路由的参数键是 `'*'`。
- **`LoaderData<T>`** —— loader 返回值的便捷别名：
  ```tsx
  const data = useLoaderData<LoaderData<typeof loader>>()
  ```
- **`RouteConfig`** —— 上面 `export const route` 的推荐标注类型。

页面模块里的 loader/action 参数类型开箱即用（`LoaderFunctionArgs` 等）；组件
侧 `useLoaderData` 的接线保持 React Router 库模式的官方写法（`as
Awaited<ReturnType<typeof loader>>`，或用上面的 `LoaderData<typeof loader>`）。
该插件不会（也无法在没有自定义路由注册表的情况下）全局改写
`useParams`/`useLoaderData`/`Link` 的泛型——这是与 `unplugin-vue-router`
typed-router 之间一处结构性差异，详见 [架构 → 类型设计](architecture.md)。

## 中间件（页面文件为何无法提供）

React Router 只允许通过 `lazy` 的**对象**形式懒加载 `middleware`
（`lazy: { middleware: async () => (await import('./x')).middleware }`）。而我们
生成的**函数**形式（`lazy: async () => ({...})`）被明确禁止返回 `middleware`
（一个不支持的键——React Router 需要在解析其他懒加载属性*之前*就知道中间件的
存在）。

v0.1 起的后果：

- **不要**从页面文件中导出 `middleware`；否则它会被忽略，并在控制台给出警告。
- 如果现在就需要基于中间件的布局/认证，应将其放入手写的路由记录中。

## 代码分割行为

每个页面模块都是独立的动态导入，因此 Vite/Rolldown 会为每个页面产出一个
chunk：

```txt
dist/assets/_id_-D3kP9x.js       # users/[id].tsx (component + loader + boundary)
dist/assets/_...rest_-Q2uZ.js    # [...rest].tsx
dist/assets/blog-B0mQ.js         # blog.tsx layout
```

同一页面的组件、loader、action 和错误边界会一起放在同一个 chunk 中——导航时
恰好只下载所需的页面。（可选参数 `[[x]].tsx` 的两个 URL 指向同一个模块，因此
共享同一个 chunk。）

## ErrorBoundary 行为说明

- 页面级的 `ErrorBoundary` 会捕获该路由自身 loader/action/渲染过程中抛出的
  错误。
- 由于边界本身也是懒加载的，*在加载页面模块本身*时发生的错误会落到最近的
  祖先边界（或 React Router 默认错误元素）上——如果这对你有影响，请记得在
  生产应用中保留一个顶层边界（例如 `layoutFile` 的根 `layout.tsx` 边界）。
