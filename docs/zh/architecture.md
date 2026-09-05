> **简体中文** · [English](../en/architecture.md)

# 架构

本页说明插件内部如何工作、为何这样设计、它与 `unplugin-vue-router`
的异同，以及当前已知的限制与尚未完成的部分。

## 动机与设计目标

React Router v8（数据模式）非常适合基于文件的路由：一张路由表不过是一份
交给 `createBrowserRouter` 的 `RouteObject[]`，而且路由对象本身已经支持对
路由模块的 `lazy` 加载。`unplugin-vue-router`（uvr）已在 Vue 一侧验证了
这套架构：

| uvr 构件 | React 能否复用？ | 如何复用 |
| --- | --- | --- |
| 文件夹扫描 + 路由树（`PrefixTree`） | ✅ 可以 | 相同的树模型，只是输出的段（segment）语法不同 |
| `codegen`（tree → 源码文本） | ✅ 可以 | 我们生成 `RouteObject` 字面量，而非 `RouteRecordRaw` |
| 虚拟模块（`vue-router/auto-routes`） | ✅ 可以 | 对应 `unplugin-react-router/routes` |
| 监视器 + 模块失效 | ✅ 可以（机制层面） | 轮询 + `reloadModule`/整页刷新 |
| `definePage` / `<route>` 代码块解析 | ❌ 不需要 | 约定是 TSX 模块的具名导出 |
| 类型化路由表（`typed-router.d.ts` 路由名） | ⚠️ 不可移植 | React Router 没有具名路由——参见[类型设计](architecture.md) |
| `data-loaders` 子系统 | ❌ 不需要 | `loader`/`action` 是 React Router 的原生能力 |

**目标**：SPA 数据模式、Vite 优先、使用原生 `react-router`、不带框架运行时；
路由模块约定与 Remix 一致，惯例贴近 uvr。

与其他方案的对比：

- **React Router 框架模式**（`@react-router/dev` + `fs-routes`）：完整的
  框架（要求根路由、配置文件、打包器/服务器插件）。本插件面向的是想要
  文件路由、但又不愿采用整套框架的应用。
- **vite-plugin-react-router-fs**（社区插件）：扫描文件夹并*写出实体*
  `routes.ts`。其约定不同（`layout.tsx`/`guard.tsx` 等特殊文件）。本插件
  改用虚拟模块，遵循 uvr 风格的惯例。

## 顶层数据流

```txt
pages/*.tsx ──scan──▶ route tree ──codegen──▶ TS/JS source ──virtual module──▶ app

  build/dev start             + add/remove page files (dev)
        │                                    │
        ▼                                    ▼
  scanPages()  ◀─────────────  polling scanner (300ms signature diff)
        │
        ├─▶ rebuild tree (from scratch, deterministic)
        ├─▶ if structure changed:
        │      server.invalidateRoutes()   (reload virtual module)
        │      server.reload()             (full page reload)
        └─▶ writeDTS() (typed-routes.d.ts, only on content change)
```

`getRoutes()`（虚拟模块的 `load`）是惰性的：只在模块被请求时才序列化当前
路由树，因此一次扫描开销很低，且失效之后模块总能保持最新。

## 模块结构

```txt
src/
├── index.ts                unplugin factory entry (generic bundlers, no dev server)
├── vite.ts                 re-exports the native Vite plugin
├── vitePlugin.ts           the real Vite plugin (recommended entry)
├── options.ts              Options / RoutesFolderOption, defaults, resolution
├── codegen/
│   ├── generateRouteRecords.ts   tree → virtual module source (pure function)
│   └── generateDTS.ts            content of typed-routes.d.ts
├── core/
│   ├── moduleConstants.ts  virtual module ids & \0 helpers
│   ├── tree.ts             segment parser + TreeNode + addFileToTree
│   ├── context.ts          routes context: scan/write/dts/generate, server API
│   └── watch.ts            watcher attachment + polling scanner
└── utils/
    ├── index.ts            string/path/indent helpers
    └── packageCheck.ts     "is a package installed" (typescript detection)
```

运行时依赖有意保持最少：`unplugin`（仅由通用入口使用）与 `picomatch`
（用于排除匹配）。`chokidar` 是仅供测试使用的开发依赖。
`react-router`/`vite` 是对等依赖（peer dependencies）。

## 路由树模型

`TreeNode`（`src/core/tree.ts`）携带生成一个路由对象所需的全部信息：

```ts
interface TreeNode {
  rawSegment: string                 // on-disk name ('users', '[id]', '(admin)', '')
  kind: 'group' | 'static' | 'param' | 'splat'
  pathSegment: string                // React Router form: ':id', '*', raw, or '' (pathless)
  file: string | null                // same-name layout file OR leaf page module (abs path)
  indexFile: string | null           // 'index' module of this node (abs path)
  children: Map<string, TreeNode>
}
```

插入（`addFileToTree`）**无论文件顺序如何**，都能解决三种特殊情况：

1. `index` 文件 → 以 `indexFile` 的形式存到父节点上。
2. 原始名称已作为目录存在的文件 → 成为该目录的 `file`（即“同名布局”，
   same-name layout）。
3. 之后在某个叶子节点下新建目录 → 该叶子保留自己的 `file`，同时获得
   `children`（它会自动成为一个布局）。

解析时会预先校验能否用 React Router 表达，无法表达则抛出描述性错误
（完整列表见 [API 参考 → Errors](api.md)）。

## 代码生成规则（tree → RouteObject）

`generateRouteRecords.ts` 遍历路由树并输出纯 JS。每个节点对应的产物：

| 节点 | 生成的记录 |
| --- | --- |
| 带 `indexFile` 的根 | 顶层 `{ index: true, lazy }`（匹配 `/`） |
| 静态/参数叶子文件 | `{ path: '<seg>', lazy }` |
| splat 文件 | `{ path: '*', lazy }` |
| 无 `file` 但带 `indexFile` 的目录 | `{ path, children: [ { index: true, lazy }, …children ] }` —— 无组件的父节点，子节点直接渲染透传 |
| 带 `file` 的目录（布局） | `{ path, lazy: layout, children: [ { index: true, lazy }?, …children ] }` |
| 带 `indexFile` 的分组 | 无路径布局（pathless layout）`{ lazy, children }` |
| 不带 `indexFile` 的分组 | 无组件、无路径的 `{ children }` |
| 空节点 | 跳过 |

为每个页面模块生成的 lazy 加载器：

```js
lazy: async () => { const m = await import('/abs/…/page.tsx'); return { Component: m.default, ...m } }
```

- 虚拟模块内部使用绝对 POSIX 导入路径（Vite 原生写法）。
- 模块源码是纯 JS：虚拟 id 没有扩展名，打包器会按 JS 解析。任何 TS 语法
  （`import type`、`satisfies`）都会破坏解析——类型改放在环境声明
  （ambient declaration）中。
- 输出是确定性的：同级按名称排序，splat 排在最后（已有单元测试覆盖）。

## 虚拟模块

- 公开 id：`unplugin-react-router/routes`
- `resolveId` 将其映射为 `\0unplugin-react-router/routes`
- `load` 返回 `ctx.getRoutes()`（按需生成）
- 除页面模块外没有任何运行时导入；`react-router` 只以类型形式出现在生成的
  环境 `.d.ts` 中

## 生命周期

**Vite 插件（`vitePlugin.ts`）**

1. `buildStart` → `ctx.scanPages()`：完整遍历每个路由文件夹，构建路由树，
   写出 dts。
2. `configureServer`（开发模式）→ 注册服务器上下文（通过
   `server.moduleGraph` + `server.reloadModule` 实现 `invalidateRoutes`；
   通过 `server.ws.send({ type: 'full-reload' })` 实现整页刷新 `reload`），
   并启动轮询扫描器。
3. `load('…/routes')` → 序列化当前路由树。
4. `buildEnd` / 服务器关闭 → 停止扫描器。

**重新扫描（新增/删除页面文件，仅开发模式）**

`createPollingScanner` 每 300 ms 比较一次签名（各路由文件夹下页面文件的
排序列表）。检测到变化后调用 `scanPages()`，后者会：

- 从头重建整棵路由树（页面文件夹通常很小，简单优先）；
- 比较签名，并且只有*结构*发生变化时：使虚拟模块失效并请求整页刷新
  （这样 `createBrowserRouter(routes)` 会拿着新路由表重新执行）；
- 仅在内容变化时重写 `typed-routes.d.ts`。

页面文件内部的纯内容编辑**绝不会**触发重新扫描：该文件本就属于路由表，
该模块自身的组件 HMR 由 Vite 处理。

## 开发 / HMR 行为——与已知限制

**能正常工作的**

- 编辑已有页面：该页面模块走标准 Vite HMR（插件不干预）。
- 首次加载与生产构建：已由测试完整覆盖。

**尚未完善的**

结构性重新扫描路径（新增/删除/重命名页面文件）*尚未在每个环境下的真实
开发会话中得到验证*。`src/core/watch.ts` 中存在两种实现：

- `attachPageWatcher` —— 绑定打包器监视器（`server.watcher`），并过滤
  `add`/`unlink` 事件；
- `createPollingScanner` —— 每 300 ms 轮询页面文件夹（默认）。

两者都做了独立的单元测试，`configureServer` 默认启动的也正是轮询扫描器。
不过，在针对 Vite 8（Rolldown）开发的过程中，我们观察到 `server.watcher`
触发的事件并不能可靠地到达从插件 `configureServer` 内部注册的监听器
（同级插件中直接注册的监听器能够收到事件，这指向打包器/监听器的管道
（plumbing）细节问题，而非逻辑缺陷）；而且在同一环境下，轮询定时器也
从未触发。症状是：新增页面文件后，路由表可能一直不更新，直到重启开发
服务器。

**目前的临时方案**：结构性文件变更后重启开发服务器。

**计划中的修复**：改由 Vite 自身的变更管道驱动结构性重新扫描
（`handleHotUpdate` + 文件夹 mtime 签名），并在 Vite 8 上用真实浏览器的
端到端测试（Playwright）验证。参见[路线图](architecture.md)。

## 类型设计及与 uvr 的差异

`unplugin-vue-router` 的类型化路由表（typed router）之所以可行，是因为
Vue Router 有**具名路由**和一套全局类型注册机制
（`declare module 'vue-router'`）。React Router 两者都没有，因此对应的
机制无法移植。取而代之，我们暴露的类型面（type surface）是：

1. **类型化路由表** —— 环境声明对外暴露 `routes: RouteObject[]`。
2. **类型化页面模块** —— `loader`/`action` 的参数类型来自
   `react-router`；获取数据时使用官方的
   `useLoaderData() as Awaited<ReturnType<typeof loader>>` 模式。
3. **不对 `useLoaderData`/`Link` 的路径做全局推断** —— 那需要带生成
   类型的自定义路由（即 TanStack Router 的做法），对于输出普通
   `RouteObject[]` 的 unplugin 来说不在范围内。

未来方向：生成路径字面量联合类型（`type AppRoutes = '/' | '/users/:id' | …`）与逐路由的参数类型，从而通过小型辅助函数为 `useParams`/`useMatches` 提供类型——仍然无需改动 React Router 本身。

## 对比：本插件与 unplugin-vue-router 的内部实现

| 关注点 | unplugin-vue-router | unplugin-react-router (v0.1) |
| --- | --- | --- |
| 框架 | Vue Router ≥ 4.4 | React Router v8（数据模式） |
| 扫描 | chokidar + tinyglobby | 纯 `fs.readdir` 遍历 + 轮询（开发模式） |
| 树 | `PrefixTree` + `TreeNodeValue`（视图覆盖、查询参数、命名） | 简化的 `TreeNode`（file/indexFile/children） |
| 代码生成 | 逐节点的 Vue 路由记录（route record）+ `_mergeRouteRecord` | 逐节点的 `RouteObject` 字面量 + lazy 包装 |
| 宏 | `definePage`（babel 转换）+ `<route>` 代码块 | 无——具名模块导出即为约定 |
| 类型 | `typed-router.d.ts` + Vue Router 模块扩展（augmentation） | 面向虚拟模块的环境 `typed-routes.d.ts` |
| 数据加载 | 实验性的 `data-loaders` 包 | 原生 `loader`/`action` |
| 路由 HMR | `router.addRoute/removeRoute` + 自定义 HMR 处理器 | 模块失效 + 整页刷新（结构性重扫待定） |
| 打包器 | unplugin（vite/webpack/rolldown/…） | Vite 原生入口 + 通用 unplugin 工厂 |

## 已知限制（汇总）

1. **开发时结构性重扫尚未验证**（见上文）——新增/删除/重命名页面文件后
   需重启开发服务器。
2. **不支持的段语法** —— 可选（`[[x]]`）、可重复（`[x]+`）、部分
   （`a-[x]`）参数；这些会在扫描时抛出异常。
3. **页面文件不能导出 `middleware`** —— React Router 禁止通过 lazy 函数
   形式提供中间件（详见[路由模块](route-modules.md)）。
4. **无具名路由 / 无类型化路由表** —— React Router API 带来的结构性结果
   （见上文的类型设计）。
5. **点嵌套（dot-nesting）**（`users.create.tsx` → `/users/create`，不产生
   UI 嵌套）尚未实现：`.` 按字面字符处理。uvr 的语义与此不同。
6. **`_inspect`** 已预留，但尚未应用到虚拟 id 上。
7. 版本策略：v0.1 仅面向 `react-router@8`（对等依赖）。框架模式与 SSR
   集成按设计不在范围内。

## 路线图

- **开发可靠性**：经由 Vite 自身的管道做结构性重扫 + Vite 8 上的浏览器
  端到端测试（最高优先级）。
- 按文件的路由级覆盖（`path`、`caseSensitive`、自定义 `handle` 合并），
  作为与 uvr `<route>` 代码块等价的有类型导出。
- 按文件夹的 `filePatterns`；点嵌套（dot-nesting）；可选参数自动拆分为
  两条路由。
- 类型：生成的路径字面量联合、面向 `useParams` 的参数辅助函数，以及便捷的
  `LoaderData` 类型。
- 布局特殊文件约定（`layout.tsx`），以可选开启的方式提供。
- 通过 `unplugin` 支持 Rollup/rolldown 的 watch（使用
  `attachPageWatcher`）。
- 发布基础设施（changesets、CI、npm provenance）。
