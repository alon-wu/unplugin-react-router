> **简体中文** · [English](../en/architecture.md)

# 架构

本页说明插件内部如何工作、为何这样设计、它与 `unplugin-vue-router`
的异同，以及当前已知的限制与尚未完成的部分。**本文档描述 v0.3**；v0.1 架构
文档里"已知限制/路线图"所列各项已在 v0.2 落地（见文末对照表），v0.3 新增
声明式布局（`layouts`）。

## 动机与设计目标

React Router v8（数据模式）非常适合基于文件的路由：一张路由表不过是一份
交给 `createBrowserRouter` 的 `RouteObject[]`，而且路由对象本身已经支持对
路由模块的 `lazy` 加载。`unplugin-vue-router`（uvr）已在 Vue 一侧验证了
这套架构：

| uvr 构件 | React 能否复用？ | 如何复用 |
| --- | --- | --- |
| 文件夹扫描 + 路由树 | ✅ 可以 | 相同的树模型，只是输出的段（segment）语法不同 |
| `codegen`（tree → 源码文本） | ✅ 可以 | 我们生成 `RouteObject` 字面量，而非 `RouteRecordRaw` |
| 虚拟模块（`vue-router/auto-routes`） | ✅ 可以 | 对应 `unplugin-react-router/routes` |
| 监视器 + 模块失效 | ✅ 可以（机制层面） | dev-server watcher 事件 + 轮询兜底 |
| `definePage` / `<route>` 代码块解析 | ⚠️ 换一种形式 | TSX 模块具名导出 + 构建期提取 `export const route` |
| 类型化路由表（typed router） | ⚠️ 换一种形式 | `AppRoutePath` / `RouteParams<P>` 类型面（无具名路由，见下） |
| `data-loaders` 子系统 | ❌ 不需要 | `loader`/`action` 是 React Router 的原生能力 |

**目标**：SPA 数据模式、Vite 优先、使用原生 `react-router`、不带框架运行时；
路由模块约定与 Remix 一致，惯例贴近 uvr。

与其他方案的对比：

- **React Router 框架模式**（`@react-router/dev` + `fs-routes`）：完整的
  框架（要求根路由、配置文件、打包器/服务器插件）。本插件面向的是想要
  文件路由、但又不愿采用整套框架的应用。
- **vite-plugin-react-router-fs**（社区插件）：扫描文件夹并*写出实体*
  `routes.ts`。其约定不同（`layout.tsx`/`guard.tsx` 等特殊文件）。本插件
  改用虚拟模块，遵循 uvr 风格的惯例（并可选支持 `layout.tsx` 风格）。

## 顶层数据流

```txt
pages/*.tsx ──scan──▶ route tree ──codegen──▶ TS/JS source ──virtual module──▶ app
    │                        │
    │ read source,           │
    │ extract route config   └──▶ typed-routes.d.ts (AppRoutePath / RouteParams…)
    ▼
  addFileToTree()  ◀── add/unlink (dev) 或 watch 轮询兜底
```

`scanPages()`（全量、确定性）：

1. 按 folder 递归收集页面文件（`extensions` + `exclude` + `filePatterns`）；
2. 逐文件读取源码并**提取路由配置**（`export const route`，纯字面量）与
   文件树约定（可选参数拆分、点嵌套、`layout.tsx`）一起插入路由树；
3. 树完整后做一次**配置放置校验**（叶子 vs 布局的最终角色只有此时确定）；
4. 结构变化时使虚拟模块失效并整页刷新；重写 `typed-routes.d.ts`。

`getRoutes()`（虚拟模块的 `load`）是惰性的：只在模块被请求时才序列化当前
路由树，因此一次扫描开销很低，且失效之后模块总能保持最新。

## 模块结构

```txt
src/
├── index.ts                unplugin factory entry（通用打包器）
├── vite.ts / vitePlugin.ts 原生 Vite 插件（watcher 接线 + 轮询兜底）
├── webpack.ts / rollup.ts / esbuild.ts   子路径适配入口
├── options.ts              Options / RoutesFolderOption, defaults, resolution
├── codegen/
│   ├── generateRouteRecords.ts   tree → virtual module source (pure function)
│   ├── generateDTS.ts            typed-routes.d.ts 内容
│   └── collectPaths.ts           树 → 每条可达 URL（供类型面使用）
├── core/
│   ├── moduleConstants.ts  virtual module ids & \0 helpers
│   ├── tree.ts             segment parser + TreeNode + addFileToTree + validate
│   ├── routeConfig.ts      `export const route` 的源码级静态提取
│   ├── context.ts          routes context: scan/write/dts/generate
│   └── watch.ts            watcher attach + polling scanner + 匹配器
└── utils/
    ├── index.ts            字符串/路径/缩进 helpers
    └── packageCheck.ts     "is a package installed"
```

运行时依赖刻意最少：`unplugin`（仅通用入口使用）与 `picomatch`（排除与
`filePatterns` 匹配）。`chokidar` 只用于测试。`react-router`/`vite` 是对等
依赖（peer dependencies）。

## 路由树模型与插入规则

`TreeNode` 携带生成一条路由所需的全部信息（`src/core/tree.ts`）：

```ts
interface TreeNode {
  rawSegment: string            // on-disk name ('users', '[id]', '(admin)', '')
  kind: 'group' | 'static' | 'param' | 'splat'
  pathSegment: string           // React Router form: ':id', '*', raw, or '' (pathless)
  file: string | null           // layout/leaf module（layout.tsx 或叶子文件）
  fileConfig?: PageRouteConfig  // 该文件的 export const route
  indexFile: string | null      // index 模块（绝对路径）
  indexConfig?: PageRouteConfig
  children: Map<string, TreeNode>
  parent: TreeNode | null
}
```

`addFileToTree` 在插入时解决四类特殊情况：

1. `index` 文件 → 挂到父节点 `indexFile`；
2. 原名称已是目录的文件 → 成为该目录的 `file`（同名布局）；
3. 之后在叶子下新建目录 → 叶子保留 `file` 并长出 `children`（自动变布局）；
4. **可选参数文件** `[[x]]`/`[[...x]]` → 在同一节点注册 `indexFile`（无参
   URL）**并**新建 `[x]`/`[...x]` 子节点，两者 `file` 都指向同一个模块；
   同时（启用时）`layout.tsx` → 当前目录节点的 `file`。

`validateTreeConfig()` 在**整棵树完成后**校验路由配置的放置：`path` 覆盖只
允许真正叶子；index 不允许 `caseSensitive`；路由组不允许 `layout.tsx` 与
`index.tsx` 布局并存等。

## 代码生成规则（tree → RouteObject）

`generateRouteRecords.ts` 遍历路由树输出纯 JS，并处理 v0.2 的三类特殊记录：

| 场景 | 产物 |
| --- | --- |
| 普通静态/参数叶子 | `{ path, lazy }` |
| 可选 `[[x]]` 文件 | 目录下 `{ index: true, lazy }` + `{ path: ':x', lazy }`（同一模块） |
| 绝对 `path` 覆盖（以 `/` 开头） | 该叶子被**提升为顶层路由**；若其磁盘父目录因此不再有任何记录，父目录也不生成（React Router 不允许子记录嵌套不一致的绝对路径） |
| 相对 `path` 覆盖 | 仅替换该记录的 `path` 值 |
| `caseSensitive` / `handle` 覆盖 | 静态输出到记录字段 |
| 根 `layout.tsx`（layoutFile） | 无路径顶层包装，包裹根 index、普通记录与提升记录 |
| 点嵌套（dotNesting） | 中间静态段仅贡献 URL（无 file 无 index） |

为每个页面模块生成的 lazy 加载器：

```js
lazy: async () => { const m = await import('/abs/…/page.tsx'); return { Component: m.default, ...m } }
```

- 虚拟模块内部使用绝对 POSIX 导入路径。
- 模块源码是纯 JS：虚拟 id 没有扩展名，打包器会按 JS 解析。任何 TS 语法
  （`import type`、`satisfies`）都会破坏解析——类型放在环境声明中。
- 输出确定：同级按名称排序、splat 最后、提升记录按路径排序。

## 路由配置提取（`export const route`）

因为 React Router 禁止 `lazy` 修改静态字段，路径/大小写覆盖必须在构建期
知道。`routeConfig.ts` 对每个页面文件做一次**源码级静态提取**：

- 只认顶层 `export const route = <对象字面量>`；
- 扫描器跳过字符串、模板串与注释，因此组件代码/文案里的同名片段不会误匹配；
- 值仅允许字面量（字符串/数字/布尔/null/嵌套数组对象）；标识符、函数调用、
  模板串、展开、拼接都会带文件路径硬报错；
- 未知键、重复键、重复导出均报错（防拼写错误被静默吞掉）。

> 我们刻意不引入 Babel/编译器依赖：这是纯文本解析，几十行、可穷举测试。
> 代价是**不支持计算值**——需要计算的值请放进 `loader` 或写成字面量。

## 类型面（与 uvr typed-router 的差异）

`unplugin-vue-router` 的类型化路由表可行，是因为 Vue Router 有**具名路由**与
全局类型注册（`declare module 'vue-router'`）。React Router 两者都没有，因此
v0.2 提供的是贴近 React 生态的类型面：

1. `typed-routes.d.ts` 声明虚拟模块 `routes: RouteObject[]`（同 v0.1）；
2. **`AppRoutePath`** —— 所有可达 URL 的字面量联合（`collectPaths.ts` 从树
   收集，与 codegen 共享同一棵树，不会漂移）；
3. **`AppRouteParams` / `RouteParams<P>`** —— 逐路由参数形状，喂给
   `useParams<RouteParams<'/users/:id'>>()`；
4. **`RouteConfig`** —— `export const route` 的标注类型；
5. **`LoaderData<T>`** —— `useLoaderData<LoaderData<typeof loader>>()` 的便捷
   别名。

不对 `useLoaderData`/`Link` 做全局推断（那需要带生成类型的自定义路由，即
TanStack Router 的做法）——这仍是本插件的边界；文档指导用户在组件里显式
传入字面量路径泛型。

## 开发 / HMR 行为（v0.2）

**能正常工作的**

- 编辑已有页面：该页面模块走标准 Vite HMR（插件不干预）。
- 首次加载与生产构建：由单元测试与 SSR 端到端测试覆盖。
- 新增/删除/重命名页面文件：`configureServer` 把
  `attachPageWatcher` 挂到 `server.watcher` 上，`add`/`unlink` 事件（且文件
  是页面文件、未被排除）触发去抖后的重新扫描 → 使虚拟模块失效并整页刷新，
  让 `createBrowserRouter(routes)` 以新路由表重跑。

**watch 策略（`Options.watch`）**

- `true`（默认）：有 dev-server watcher 就用事件驱动；没有任何可用 watcher
  时自动回退到轮询扫描器。
- `'polling'`：强制轮询（每 300 ms 比较各文件夹的页面文件签名）。Vite 8 /
  Rolldown 的某些环境里，从插件内部注册的 watcher 监听曾出现收不到事件的
  问题——遇到此类情况请显式使用 `'polling'`。
- `false`：完全关闭（结构性改动需重启 dev server）。

页面文件内部的纯内容编辑**绝不会**触发重新扫描：该文件本就属于路由表，
该模块自身的组件 HMR 由 Vite 处理。

## 对比：本插件与 unplugin-vue-router 的内部实现

| 关注点 | unplugin-vue-router | unplugin-react-router (v0.2) |
| --- | --- | --- |
| 框架 | Vue Router ≥ 4.4 | React Router v8（数据模式） |
| 扫描 | chokidar + tinyglobby | `fs.readdir` 遍历 + dev-server watcher / 轮询兜底 |
| 树 | `PrefixTree` + `TreeNodeValue`（视图覆盖、查询参数、命名） | 简化 `TreeNode`（file/indexFile/config/children） |
| 代码生成 | 逐节点 Vue 路由记录 + `_mergeRouteRecord` | 逐节点 `RouteObject` + lazy 包装（含提升/可选拆分） |
| 宏 | `definePage`（babel 转换）+ `<route>` 代码块 | `export const route` 字面量 + 源码级静态提取 |
| 类型 | `typed-router.d.ts` + Vue Router 模块扩展 | `typed-routes.d.ts` + `AppRoutePath`/`RouteParams`/`RouteConfig`/`LoaderData` |
| 数据加载 | 实验性 `data-loaders` | 原生 `loader`/`action` |
| 路由 HMR | `router.addRoute/removeRoute` | 模块失效 + 整页刷新（事件驱动或轮询） |
| 打包器 | unplugin（vite/webpack/rolldown/…） | vite 原生 + unplugin 工厂（webpack/rollup/esbuild 子路径） |

## 已知限制（v0.2）

1. **部分参数不可表达**：可重复（`[id]+`）、部分（`prefix-[id]`）、目录级
   可选（`[[x]]/`）不支持——React Router 路径语法无法表达；可选参数只支持
   文件级并拆成两条路由。
2. **`middleware` 无法经页面文件提供**：React Router 只允许 `lazy` 的
   *对象*形式提供中间件；我们的函数形式被其明确禁止（见
   [路由模块](route-modules.md)）。
3. **无具名路由 / 无 `useLoaderData`/`Link` 全局推断**：React Router 结构性
   差异（见"类型面"）。
4. **绝对 `path` 覆盖会脱离其磁盘父目录**：提升为顶层后不再被中间层目录布局
   包裹（仍会被根 `layout.tsx` 包裹）；这不是 bug，是 React Router 的路径
   约束。
5. **`layout.tsx` 与点嵌套默认关闭**：需要显式开启 `layoutFile`/`dotNesting`
   （同名文件布局与字面点号是默认且向后兼容的约定）。
6. 版本策略：v0.2 面向 `react-router@8`（对等依赖）与 Node ≥ 20.19。框架模式
   与 SSR 运行时不内置（产物为纯 `RouteObject[]`，可自行用于 SSR/SSG）。

## v0.1 路线图 → v0.2 落地对照

| v0.1 路线图条目 | 状态 |
| --- | --- |
| Vite 自身管道驱动的结构性重扫 | ✅ dev-server watcher + `watch: 'polling'` 兜底；Vite 8 真实浏览器 E2E 待跑（测试用 dev-server 级集成覆盖） |
| 按文件路由级覆盖（path/caseSensitive/handle） | ✅ `export const route`（静态提取） |
| 按文件夹 `filePatterns` | ✅ `RoutesFolderOption.filePatterns` |
| 点嵌套（dot-nesting） | ✅ `dotNesting: true` |
| 可选参数自动拆分为两条路由 | ✅ `[[x]].tsx` / `[[...x]].tsx` |
| 类型：路径字面量联合、useParams 参数辅助、LoaderData | ✅ `AppRoutePath` / `RouteParams<P>` / `LoaderData<T>` |
| 布局特殊文件 `layout.tsx`（可选开启） | ✅ `layoutFile: 'layout'` |
| 通过 `unplugin` 支持 Rollup/rolldown watch | ✅ rollup/rolldown 重建自带重扫 + `./rollup` 等子路径 |
| 发布基础设施（changesets、CI、npm provenance） | ✅ 已加入 |

## 仍待探索

- Vite 8（Rolldown）上的真实浏览器（Playwright）端到端矩阵；
- 在部分 Vite 8 环境中 watcher 事件不可靠的根治（当前用 `'polling'` 兜底）；
- 更细粒度的"路由模块拆分"（loader 与组件分 chunk）；
- 与 TanStack Router 风格的自定义类型路由集成（超出现有边界）。

## v0.3：声明式布局（`layouts` 选项）

### 动机

此前"布局 = 目录/文件位置"（同名目录布局、`layoutFile`、路由组壳）。对希望
布局组件集中管理、页面在 `src/pages` 平铺、用**页面代码声明挂哪个布局**的
项目（Vue 生态 `definePage`/layouts 心智），位置式布局不够直接。v0.3 引入
可选的声明式布局层，两条心智模型由选项开关互斥：

- 不配置 `layouts`：行为与 v0.2 完全一致（目录决定布局）；
- 配置 `layouts: { dir, default }`：**布局只来自页面声明 + 默认壳**，目录
  只贡献 URL。

### 配置与布局发现

```ts
reactRouter({
  layouts: { dir: 'src/app', default: 'blank' },
})
```

- `dir` 相对 `root` 解析；必须存在。布局文件按 **文件名 = 布局 id** 在 `dir`
  下**任意层级**递归发现（扩展 `.tsx`/`.jsx`），跳过名为 `components` 的目录
  与点/下划线开头目录；同名布局报错。
- `default` 为该模式下的默认壳：`<dir>/<default>.tsx` 必须能找到，否则构建期
  报错（含候选列表）。
- 页面声明 `export const route = { layout: 'admin' }` 时，布局 id 必须在发现
  集合中（否则报错）；未开启 `layouts` 时该键无效果。

### 生成模型（顶层换壳）

`generateRouteRecords` 在提供 `LayoutContext`（defaultId + 布局模块表）时走
`genLayoutsRecords`：

1. 先生成**顶层成员**：根 index、排序后的顶层目录/叶子记录、被绝对 `path`
   提升的叶子；
2. 计算每个成员的归属布局：整棵子树内所有页面（跳过被提升叶子）必须一致——
   全未声明 → `default`；全同一 `layout: L` → `L`；混用（未声明 + 声明、
   或多个不同声明）→ 构建期报错（含文件与指引）；
3. 按布局分组：每组生成一条 pathless 壳记录 `{ lazy: <布局文件>, children:
   [成员…] }`；`default` 壳排最前，其余按 id 排序；空壳不生成；
4. URL/参数/`handle`/类型面与换壳无关，保持不变。

同一布局的多个顶层成员聚合进**同一条懒加载壳记录**（布局组件单份、React
单实例）。

### 与既有能力的互斥规则

`layouts` 开启期间，以下"目录隐式布局"会被构建期报错并给出指引（改用声明）：

- 同名文件 + 目录布局（§4a，`blog.tsx` + `blog/`）；
- 路由组的壳含义（`(name)/index.tsx` 或组内布局文件）；
- `layoutFile`（含根 `layout.tsx` 全局壳）。

普通 `index.tsx`（"默认内容"）不受影响，仍作为该路径的默认页面；未声明页面
（含首页 `/` 与 `[...rest]` 404）进入默认壳。

### 实现位置

- `src/options.ts`：`LayoutsOptions`/`ResolvedLayouts` 解析与校验；
- `src/core/context.ts`：`readLayoutFiles`（递归发现）、
  `assertNoImplicitLayouts`、`assertLayoutsResolve`，scan 时刷新
  `layoutContext`；
- `src/codegen/generateRouteRecords.ts`：`LayoutContext` 类型、
  `subtreeLayout`（块一致性）、`groupedMembers`/`genLayoutsRecords`（分组换
  壳）；
- `src/core/routeConfig.ts` + `src/codegen/generateDTS.ts`：`layout` 键的静态
  提取与 `RouteConfig.layout` 类型；
- 布局目录被纳入 dev watch（布局增删即重扫）。

### v0.3 限制

- 布局粒度为**顶层成员**：一个顶层目录块内不得混用布局（报错）；
  需要"目录内逐页不同壳"请拆成独立顶层文件/路由组。
- 不支持布局嵌套声明（页面只声明一个壳；需要嵌套时把外层壳放入布局组件
  结构自行组合，或使用 route handle 自行实现）。
- `layouts` 与 `layoutFile`/同名目录布局在同一项目内互斥（由报错保证）。
