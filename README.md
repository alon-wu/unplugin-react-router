# unplugin-react-router

> 为 [React Router](https://reactrouter.com) v8 提供基于文件的路由 —— 灵感源自
> [unplugin-vue-router](https://github.com/posva/unplugin-vue-router)。零配置的数据模式（Data Mode）SPA：
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
- **沿用 unplugin-vue-router 的约定**并适配 React Router：`index`、`[param]`、
  `[...splat]`、无路径路由组 `(name)`、同名文件夹布局、多路由文件夹与前缀、
  自定义扩展名、排除规则。
- **类型化开箱即用**。自动生成的 `typed-routes.d.ts` 为虚拟模块
  `unplugin-react-router/routes` 提供类型。

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

> 默认扫描 `src/pages/` 下的 `.tsx`/`.jsx` 文件。插件还会在项目根目录生成
> `typed-routes.d.ts`，让 TypeScript 能识别上面的虚拟导入（若未被自动包含，
> 请把它加进 `tsconfig` 的 `include`）。

## 语言

| 语言 | 入口 |
| --- | --- |
| **简体中文（默认）** | 本页 + [docs/zh 中文文档](#文档) |
| English | [README.en.md](README.en.md) + [docs/en 英文文档](docs/en/) |

## 文档

| 文档 | 内容 |
| --- | --- |
| [入门指南](docs/zh/getting-started.md) | 环境要求、安装、配置、入口接线、TypeScript 配置、第一个页面 |
| [文件约定](docs/zh/file-conventions.md) | 完整的“文件 → 路由”映射、布局、路由组、动态段与兜底段、边界与报错 |
| [路由模块](docs/zh/route-modules.md) | 页面模块契约、生成的懒加载器、支持的导出与类型指引 |
| [API 参考](docs/zh/api.md) | `Options`、`RoutesFolderOption`、虚拟模块、生成文件、包导出、全部报错信息 |
| [架构](docs/zh/architecture.md) | 动机、模块地图、路由树模型、代码生成、虚拟模块、开发/热更新行为、与 unplugin-vue-router 的对比、已知限制与路线图 |
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

早期 **v0.1 原型**。代码生成、树规则、虚拟模块与路由模块契约由单元测试 +
React Router v8 SSR 端到端套件覆盖；参见[测试与贡献](docs/zh/testing.md)。
采纳前请阅读[已知限制](docs/zh/architecture.md)。

## License

MIT
