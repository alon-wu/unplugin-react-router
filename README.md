# unplugin-react-router

> 为 [React Router](https://reactrouter.com) v8 提供基于文件的路由 —— 灵感源自
> [unplugin-vue-router](https://uvr.esm.is/)。零配置的数据模式（Data Mode）SPA：
> 在 `src/pages` 里放一个文件，即可得到一条按需加载且带类型的路由。

```txt
src/pages/
├── index.tsx          →  /              # 首页
├── about.tsx          →  /about
├── users/
│   ├── index.tsx      →  /users         # 列表页（index 路由）
│   └── [id].tsx       →  /users/:id     # 详情（loader + ErrorBoundary）
├── blog.tsx           →  /blog          # 布局（与文件夹同名的文件）
└── blog/
    ├── index.tsx      →  /blog          # 默认内容
    └── [slug].tsx     →  /blog/:slug    # 渲染于 blog.tsx 的 <Outlet/>
```

## 特性亮点

- **无需框架模式**。纯 React Router v8 *数据模式（Data Mode）* + Vite。没有
  `root.tsx`、没有 `@react-router/dev`、没有 Remix 运行时 —— 只需要
  `createBrowserRouter(routes)`。
- **开箱即用的代码分割**。每个页面模块都通过生成的 `route.lazy` 加载，组件、
  `loader`、`action` 与错误边界按路由拆分。
- **路由模块契约**。`default` 导出 = 组件；命名导出（`loader`、`action`、
  `handle`、`ErrorBoundary`、`HydrateFallback`、`shouldRevalidate`）成为对应的
  路由属性。
- **路由级覆盖（v0.2）**。页面里 `export const route = { path, caseSensitive,
  handle }`（纯字面量、构建期静态读取）即可覆盖 URL / 大小写 / 静态
  `handle` —— `definePage`/`<route>` 代码块的 React 等价物。
- **文件约定贴近 unplugin-vue-router 并适配 React Router**：`index`、`[param]`、
  `[...splat]`、无路径路由组 `(name)`、同名文件夹布局；另有可选参数
  `[[lang]].tsx`（自动拆成两条路由）、可选的点嵌套（`dotNesting`）、可选
  `layout.tsx` 特殊文件（`layoutFile`）、多路由文件夹与前缀、自定义扩展名、
  排除规则与逐文件夹 `filePatterns`。
- **声明式布局绑定（v0.3）**：`layouts: { dir: 'src/app', default: 'blank' }`
  开启后，布局组件在 `dir` 下按名字递归发现（跳过 `components`）；所有未在
  页面声明的顶层路由自动包进 `default` 壳，页面里写
  `export const route = { layout: 'admin' }` 即被**提出并换到 admin 壳**——
  像 Vue 生态 `definePage`/layouts 一样的按页声明体验，而页面仍平铺在
  `src/pages`。
- **类型化开箱即用（v0.2）**。自动生成的 `typed-routes.d.ts` 声明虚拟模块
  `unplugin-react-router/routes`，并导出 `AppRoutePath`（全部 URL 联合）、
  `RouteParams<'/users/:id'>`（逐路由参数，喂给 `useParams`）、`RouteConfig`
  与 `LoaderData<T>`。
- **开发体验**。新增/删除/重命名页面文件即时热更（dev-server watcher 驱动，
  `watch: 'polling'` 兜底），无需重启。
- **多打包器**：`vite`、`webpack`、`rollup`（含 rolldown）、`esbuild`。

## 快速开始

```bash
pnpm add -D unplugin-react-router
pnpm add react-router@^8
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from 'unplugin-react-router/vite'

export default defineConfig({
  plugins: [react(), reactRouter()],
})
```

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { routes } from 'unplugin-react-router/routes'

const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
```

> 默认扫描 `src/pages/` 下的 `.tsx`/`.jsx` 文件。插件会在项目根目录生成
> `typed-routes.d.ts`（含路由类型面；若未被自动包含，请把它加进 `tsconfig`
> 的 `include`）。

### 可选：声明式布局（v0.3）

把共享布局集中到一个目录（例如 `src/app/`），页面在 `src/pages` 平铺、用
代码声明挂哪个布局：

```ts
// vite.config.ts
reactRouter({
  layouts: { dir: 'src/app', default: 'blank' }, // 默认壳必须存在
})
```

```txt
src/app/
├── blank.tsx        # 默认壳：包裹所有未声明的顶层页面（内含 <Outlet/>）
└── admin.tsx        # 业务壳
src/pages/
├── login.tsx        # 未声明 → 自动挂 blank 壳
└── dashboard.tsx    # 声明 → 换到 admin 壳
```

```tsx
// src/pages/dashboard.tsx
export const route = { layout: 'admin' } // 提出到 src/app/admin.tsx 壳下
```

开启 `layouts` 后，目录不再表达布局（只贡献 URL）；同名目录布局/`layoutFile`
会被构建期报错并给出指引。详见
[文件约定 → 声明式布局](docs/zh/file-conventions.md)。

类型化用法示例（生成文件导出，纯类型、无运行时开销）：

```tsx
import { useParams } from 'react-router'
import type { AppRoutePath, RouteParams } from 'unplugin-react-router/routes'

// src/pages/users/[id].tsx
const { id } = useParams<RouteParams<'/users/:id'>>() // id: string

// 需要穷举所有路由的场景
const known: AppRoutePath[] = ['/', '/about', '/users/:id']
```

## 语言

| 语言 | 入口 |
| --- | --- |
| **简体中文（默认）** | 本页 + [docs/zh 中文文档](#文档) |
| English | [README.en.md](README.en.md) + [docs/en 英文文档](docs/en/) |

## 文档

| 文档 | 内容 |
| --- | --- |
| [入门指南](docs/zh/getting-started.md) | 环境要求、安装、配置、入口接线、TypeScript 配置、第一个页面 |
| [文件约定](docs/zh/file-conventions.md) | 完整的"文件 → 路由"映射、布局、可选参数、点嵌套、动态段与兜底段、边界与报错 |
| [路由模块](docs/zh/route-modules.md) | 页面模块契约、`export const route` 覆盖、生成的懒加载器、类型面指引 |
| [API 参考](docs/zh/api.md) | `Options`、`RoutesFolderOption`、虚拟模块、生成文件、包导出、全部报错信息 |
| [架构](docs/zh/architecture.md) | 动机、模块地图、路由树模型、代码生成、虚拟模块、开发/热更新行为、与 unplugin-vue-router 的对比、已知限制与路线图对照 |
| [测试与贡献](docs/zh/testing.md) | 测试矩阵、每套测试的机制、开发命令、如何补充覆盖 |

英文版见 [docs/en](docs/en/)；两版内容一一对应（`getting-started.md` … `testing.md`）。

## 生态定位

| 方案 | 取舍 |
| --- | --- |
| **本插件** | 库模式（library/data-mode）SPA、无框架、约定贴近 unplugin-vue-router、虚拟模块带类型 |
| [React Router 框架模式](https://reactrouter.com/start/framework/routing)（`@react-router/dev` + `fs-routes`） | 功能全面，但需要框架模式：`root.tsx`、配置文件、服务端运行时 |
| [vite-plugin-react-router-fs](https://github.com/eralvarez/vite-plugin-react-router-fs) | 社区插件，把结果写成物理文件 `routes.ts`；更轻量，约定不同 |

完整对比见[架构 → 动机与设计目标](docs/zh/architecture.md)。

## 状态

**v0.2**：代码生成、树规则、可选参数、路由级覆盖、类型面、虚拟模块与路由
模块契约由单元测试 + React Router v8 SSR 端到端套件覆盖（见
[测试与贡献](docs/zh/testing.md)）。v0.1 架构文档的路线图已全部落地
（[对照表](docs/zh/architecture.md#v01-路线图--v02-落地对照)）。发布走
changesets + GitHub Actions（npm provenance）；采纳前请阅读
[已知限制](docs/zh/architecture.md)。

## License

MIT
