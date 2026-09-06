> **简体中文** · [English](../en/testing.md)

# 测试与贡献

## 测试套件

测试运行在 Node 上（`vitest`，无 DOM），覆盖七个测试套件：

| 文件 | 验证内容 |
| --- | --- |
| `tests/tree.test.ts` | 分段（segment）解析、校验错误、树的插入、splat/index/重复规则；v0.2：可选参数 `[[x]]`/`[[...x]]` 拆分、点嵌套、`layout.tsx`（`layoutFile`）与 `export const route` 的放置校验 |
| `tests/routeConfig.test.ts` | `export const route` 的源码级静态提取：纯字面量解析、跳过字符串/模板串/注释、非对象/计算值/未知键/重复导出报错 |
| `tests/generateRouteRecords.test.ts` | 代码生成输出形态：index/param/splat 记录、同名布局合并、无路径（pathless）分组、确定性；v0.2：path/caseSensitive/handle 覆盖、可选参数拆分、根 `layout.tsx`、点嵌套输出 |
| `tests/typedSurface.test.ts` | 可达 URL 收集（每条路径及其参数键、确定性排序）与 `typed-routes.d.ts` 类型面生成（空树亦产出合法表面） |
| `tests/plugin.test.ts` | v0.2 选项解析（`layoutFile`/`filePatterns` 校验与逐文件夹解析）、filePatterns 过滤扫描、Vite 插件 dev-server 接线（watcher 触发的重载、`watch: 'polling'` 轮询） |
| `tests/watch.test.ts` | `attachPageWatcher` 的添加/删除过滤、排除项处理、detach 行为 |
| `tests/runtime.test.ts` | **端到端（e2e）**：插件扫描测试夹具（fixtures）目录 → 执行生成的虚拟模块 → React Router v8 **静态路由**渲染真实 URL（loaders、boundaries、layouts） |
| `tests/layouts.test.ts` | **v0.3 声明式布局**：`layouts` 选项解析/校验（dir/default 缺失、非法 id）、布局文件递归发现（深层 default、跳过 `components`、重复同名）、默认壳 + 声明换壳的生成分组、隐式目录布局禁用报错、顶层块混用报错、未开启时 `layout` 键惰性 |

端到端测试套件是最强的信号：它针对已安装的 `react-router@8` 走一遍用户实际触达的完整代码路径（扫描 → 代码生成 → `routes` → `createStaticHandler`/`createStaticRouter` → `renderToString`）。

### 端到端测试套件覆盖的 URL（测试夹具位于 `tests/fixtures/pages/`）

| URL | 期望文本 | 验证点 |
| --- | --- | --- |
| `/` | `HOME` | 顶层 `index: true` 路由 |
| `/about` | `ABOUT` | 静态叶子路由 |
| `/users` | `USERS` | 目录 index 路由 |
| `/users/42` | `USER 42` | 动态 `:id`，懒加载 loader 执行，数据已注入 |
| `/users/bad` | `USER-ERROR` | 页面 `ErrorBoundary` 处理 loader `Response` 404 |
| `/blog` | `BLOG-LAYOUT` + `BLOG-INDEX` | 同名文件布局 + index 子路由 |
| `/blog/some-post` | `BLOG-LAYOUT` + `POST some-post` | 布局 + 其下的懒加载 loader |
| `/cart` | `SHOP-LAYOUT` + `CART` | 无路径分组布局（`(shop)/index.tsx`） |
| `/dashboard` | `DASHBOARD` | 仅组织用分组（无组件的无路径分组） |
| `/unknown-path` | `NOTFOUND` | `[...rest].tsx` splat |
| `/docs`、`/docs/hello` | `CHAPTER` | 可选参数 `[[chapter]].tsx`：无参与带参 URL 都命中同一模块（拆成两条记录） |

v0.2 的其余新能力由独立的 fixture 文件夹 + 选项覆盖：

- `overrides-pages/members/[id].tsx` 通过 `export const route` 把 URL 重写为
  `/user/:id`（提升为顶层）：`/user/7` 渲染 `MEMBER`，原 `/members/7` 不再匹配；
- `layout-pages/` + `layoutFile: 'layout'`：根 `layout.tsx` 成为无路径顶层包装，
  `/` 与 `/about` 都包含 `ROOT-LAYOUT`；
- `dot-pages/settings.profile.tsx` + `dotNesting: true`：`/settings/profile`
  渲染 `SETTINGS-PROFILE`。

v0.3 的声明式布局另有独立 SSR fixture 工程 `layouts-app/`（`app/` 放
`blank.tsx`/`admin.tsx`，`pages/` 放页面）：

- 未声明页面（`/`、`/login`、`/users/:id`）渲染 `BLANK-SHELL` + 各自内容；
- `/dashboard`（`export const route = { layout: 'admin' }`）渲染 `ADMIN-SHELL`
  且**不含** `BLANK-SHELL`（换壳验证）。

## 运行检查

```bash
pnpm install

pnpm test         # vitest run — 全部七个测试套件
pnpm test:e2e     # Playwright — 真实浏览器验收（自动起/停 vite）
pnpm typecheck    # 插件源码的 tsc --noEmit
pnpm build        # tsup: dist/{index,vite,webpack,rollup,esbuild}.{js,cjs,d.ts}

# playground
pnpm dev          # 在 playground/src/pages 上运行 vite dev
pnpm -C playground build
```

`pnpm test` 刻意保持低依赖（无 jsdom/happy-dom）：端到端测试套件使用 React Router 的静态路由 + `react-dom/server`，因此可以在纯 Node 环境下运行。

## 浏览器 E2E（Playwright，v0.2/v0.3）

两个独立的 fixture Vite 应用，由 `playwright.config.ts` 自动起/停 dev server
（双 project，各配一个端口与 spec）：

- **`tests/e2e-app/`**（端口 5202，project `app`）：v0.2 能力矩阵——开启
  `dotNesting` 与 `layoutFile`，另含 `filePatterns` 文件夹与参数化前缀文件夹；
  `tests/e2e/e2e.spec.ts` 16 条断言：基础约定（index/静态/动态/同名布局/
  路由组/404）、v0.2 特性（根 `layout.tsx`、可选参数 `[[chapter]]`、`path`
  绝对覆盖含原路径失效、点嵌套、`filePatterns`、参数化前缀）、开发期结构性
  HMR（增删页面文件即时生效，15 s 预算）。
- **`tests/e2e-layouts-app/`**（端口 5203，project `layouts`）：v0.3 声明式
  布局；`tests/e2e/layouts.spec.ts` 7 条断言：未声明页面（`/`、`/login`、
  `/settings`、`/users/*`、404）都在默认（blank）壳内渲染；声明
  `route.layout = 'admin'` 的 `/dashboard` 渲染在 ADMIN 壳且不含 BLANK 壳；
  另有两条**布局结构性 HMR**：运行中新增布局文件 + 声明它的页面 → 无需重启
  即可访问新壳；删除被引用的布局文件 → 页面导航报
  `Failed to fetch dynamically imported module`，把布局文件加回后自动恢复。

```bash
pnpm test:e2e                     # 全量（两个工程，自动起 vite + 浏览器）
pnpm exec playwright test -- --ui # 可视化 UI 模式
pnpm test:e2e -- -g "optional"    # 按标题过滤
pnpm exec playwright test --project=layouts   # 只跑 v0.3 布局工程
```

本地复用系统 Chrome（`playwright.config.ts` 的 `channel: 'chrome'`，免下载）；
CI 的 `e2e` job 改用 Playwright 管理的 Chromium（`pnpm exec playwright install
--with-deps chromium`）。

`tests/scripts/playground-smoke.mjs` 是对真实 playground dev server
（`127.0.0.1:5173`）的冒烟脚本：先 `pnpm dev` 再
`node tests/scripts/playground-smoke.mjs`——逐 URL 断言页面 marker 且无
console/运行时错误，并现场做一次"加/删页面文件 → 路由出现/失效"的结构性 HMR
检查。

## 把 playground 当作手工验证参考

`playground/src/pages/` 复刻了每一种约定（index、`[id]`、`[...rest]`、分组布局、仅组织用分组、同名布局）。它直接接插件**源码**（`playground/vite.config.ts` 导入 `../src/vite.ts`），因此 `pnpm dev` 之前无需构建步骤；插件改动在重启后生效。

## 如何补充测试覆盖

- 新增文件约定 → 扩展 `tests/tree.test.ts`（解析/插入）与 `tests/generateRouteRecords.test.ts`（输出形态），然后在 `tests/runtime.test.ts` 的 `it.each` 表中加入一个测试夹具页面 + 一行，以覆盖行为层面的保证。
- 新增选项 → 在 `tests/plugin.test.ts` 中断言其解析/接线结果，并在 `docs/api.md` 中说明。
- v0.1 刻意避免对完整生成模块做快照测试（测试夹具路径因机器而异）；断言针对结构性片段（`path`、`index: true`、导入说明符、确定性）。

## 贡献指南

- 运行时依赖保持为零/最小化；优先使用纯 Node API。
- 保持代码生成纯粹（树 → 字符串），使其始终可做快照测试。
- 行为改动须同步更新文档（`docs/`）；文档对照实现编写，应始终保持真实（参见“已知限制”各节）。
- 提交前必须通过 `pnpm typecheck` 与 `pnpm test`。

## 验收记录（Verification record）

以下为 2026-09-06（v0.3 声明式布局交付）一轮完整验收的快照；数字会随版本
演进，常跑请以本节开头给出的命令为准。

| 项目 | 结果 |
| --- | --- |
| `pnpm typecheck` | ✅ `tsc --noEmit` 无错误 |
| `pnpm test`（vitest，8 套件） | ✅ 87/87：tree 26 · routeConfig 13 · typedSurface 4 · generateRouteRecords 9 · layouts 9 · runtime(SSR) 16 · plugin 7 · watch 3 |
| `pnpm build` | ✅ ESM + CJS + d.ts（5 入口） |
| `pnpm test:e2e`（Playwright/Chrome 双工程） | ✅ 23/23：`app` 16（基础约定、v0.2 特性、dev HMR）+ `layouts` 7（默认壳/换壳 + 2 条布局 HMR） |
| 消费方类型校验 | ✅ 临时真实工程：`route.layout` satisfies `RouteConfig`、`LoaderData<typeof loader>` 通过 `tsc`；生成的 routes 同时含 `blank`/`admin` 壳 |
| `pnpm changeset status` | ✅ minor：`unplugin-react-router` |

验证过程中发现并记录的边界行为：删除"仍被路由表引用的布局文件"时，dev 下
页面会在下次导航报 `Failed to fetch dynamically imported module`（浏览器侧旧
模块缓存已失效、新文件不存在）；把布局文件加回（或移除引用它的页面）后即恢复，
全程无需重启 dev server——`tests/e2e/layouts.spec.ts` 的两条布局 HMR 用例固化
了这一行为。
