> **简体中文** · [English](../en/getting-started.md)

# 快速开始

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| `react-router` | `^8.0.0`（peer 依赖） | 数据模式（Data Mode）SPA。一切内容都映射到 `RouteObject`。 |
| `vite` | `^5 || ^6 || ^7 || ^8`（可选 peer 依赖） | 仅在通过 `./vite` 入口使用时才需要。 |
| `react` / `react-dom` | `^19`（通常） | 任意与 React Router v8 兼容的版本。 |
| Node.js | ≥ 20（CI/开发基于 24 测试） | 仅支持 ESM，使用现代 `node:` API。 |

TypeScript 可选但建议安装——只有当检测到已安装 `typescript`（或传入了 `dts: true`）时，插件才会生成对应的 `.d.ts` 文件。

## 安装

```bash
# with pnpm
pnpm add -D unplugin-react-router
pnpm add react-router@^8

# or npm / yarn
npm i -D unplugin-react-router
npm i react-router@^8
```

## 配置 Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from 'unplugin-react-router/vite'

export default defineConfig({
  plugins: [
    react(),
    reactRouter({
      // routesFolder: 'src/pages',   // default
      // extensions: ['.tsx', '.jsx'],// default
      // dts: 'typed-routes.d.ts',    // default when typescript is installed
    }),
  ],
})
```

### 为什么需要 `/vite` 入口？

该包暴露两个入口：

- `unplugin-react-router/vite` —— **原生 Vite 插件**（推荐）。它会同时接入虚拟模块与开发服务器相关的部分（轮询新增与删除的页面文件、模块失效、整页刷新）。
- `unplugin-react-router` —— 一个通用的 `unplugin` 工厂，适用于 rollup/rolldown/… 等构建。当你通过其它打包器构建时它很有用；但它不提供开发服务器的文件监听。

## 接入路由——唯一的手动步骤

```tsx
// src/main.tsx
import React from 'react'
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

`unplugin-react-router/routes` 是一个**虚拟模块**：磁盘上并不存在对应的文件。插件会在构建/开发时拦截对该模块的引用，并以生成的 `RouteObject[]` 作答（参见 [架构 → 虚拟模块](architecture.md)）。

你也可以通过它的默认导出引入同一份路由列表：

```ts
import routes from 'unplugin-react-router/routes'
// routes === the same RouteObject[]
```

## TypeScript 集成

首次 dev/build 运行后，插件会（默认）在 `root` 旁生成 `typed-routes.d.ts`：

```ts
// typed-routes.d.ts (generated — do not edit)
declare module 'unplugin-react-router/routes' {
  import type { RouteObject } from 'react-router'
  export const routes: RouteObject[]
  export default routes
}
```

请确保 TypeScript 能读取到该文件。`tsconfig.json` 的两种常见写法如下：

```jsonc
// covers any *.d.ts under the project root
{ "include": ["src", "typed-routes.d.ts"] }

// or simply include the root folder recursively
{ "include": ["."] }
```

> 为什么这个模块需要该声明？它的运行时源码是纯 JS（由于虚拟模块 id 没有扩展名，打包器会把它当作 JS 解析），因此正是这份环境声明（ambient declaration）为你提供编辑器补全与类型检查。

如果你不使用 TypeScript，可以通过 `dts: false` 关闭生成。

## 编写你的第一个页面

创建 `src/pages/index.tsx` 和 `src/pages/about.tsx`：

```tsx
// src/pages/index.tsx
import { Link } from 'react-router'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <Link to="/about">About</Link>
    </main>
  )
}
```

```tsx
// src/pages/about.tsx
export default function About() {
  return <main><h1>About</h1></main>
}
```

运行 `pnpm dev`（或 `vite`），然后打开 `http://localhost:5173/` 与 `/about`。每个页面都会成为独立的 chunk，在导航时按需懒加载。要添加 loader 或 error boundary，只需从模块中导出它们即可——参见 [路由模块](route-modules.md)。

## 生产构建

```bash
pnpm build
# or: vite build
```

Vite/Rolldown 会对插件生成的动态 import 进行静态分析，因此每个页面文件都会作为独立的 chunk 输出（你会看到 `_id_-…js`、由 `[...rest]` 派生出的 chunk 名等）。

## 页面文件夹为空时会发生什么？

此时 `routes` 为 `[]`。`createBrowserRouter([])` 不会渲染任何内容，并会记录一条关于缺少根路由的警告；添加一个 `index.tsx` 即可获得 `/` 路由。
