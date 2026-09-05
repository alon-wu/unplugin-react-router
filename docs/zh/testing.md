> **简体中文** · [English](../en/testing.md)

# 测试与贡献

## 测试套件

测试运行在 Node 上（`vitest`，无 DOM），覆盖四个层面：

| 文件 | 验证内容 |
| --- | --- |
| `tests/tree.test.ts` | 分段（segment）解析、校验错误、树的插入、splat/index/重复规则 |
| `tests/generateRouteRecords.test.ts` | 代码生成输出形态：index/param/splat 记录、同名布局合并、无路径（pathless）分组、确定性 |
| `tests/watch.test.ts` | `attachPageWatcher` 的添加/删除过滤、排除项处理、detach 行为 |
| `tests/runtime.test.ts` | **端到端（e2e）**：插件扫描测试夹具（fixtures）目录 → 执行生成的虚拟模块 → React Router v8 **静态路由**渲染真实 URL（loaders、boundaries、layouts） |

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

## 运行检查

```bash
pnpm install

pnpm test         # vitest run — 全部四个测试套件
pnpm typecheck    # 插件源码的 tsc --noEmit
pnpm build        # tsup: dist/{index,vite}.{js,cjs,d.ts}

# playground
pnpm dev          # 在 playground/src/pages 上运行 vite dev
pnpm -C playground build
```

`pnpm test` 刻意保持低依赖（无 jsdom/happy-dom）：端到端测试套件使用 React Router 的静态路由 + `react-dom/server`，因此可以在纯 Node 环境下运行。

## 把 playground 当作手工验证参考

`playground/src/pages/` 复刻了每一种约定（index、`[id]`、`[...rest]`、分组布局、仅组织用分组、同名布局）。它直接接插件**源码**（`playground/vite.config.ts` 导入 `../src/vite.ts`），因此 `pnpm dev` 之前无需构建步骤；插件改动在重启后生效。

## 如何补充测试覆盖

- 新增文件约定 → 扩展 `tests/tree.test.ts`（解析/插入）与 `tests/generateRouteRecords.test.ts`（输出形态），然后在 `tests/runtime.test.ts` 的 `it.each` 表中加入一个测试夹具页面 + 一行，以覆盖行为层面的保证。
- 新增选项 → 在 `tests/` 下写一个小测试断言其解析结果，并在 `docs/api.md` 中说明。
- v0.1 刻意避免对完整生成模块做快照测试（测试夹具路径因机器而异）；断言针对结构性片段（`path`、`index: true`、导入说明符、确定性）。

## 贡献指南

- 运行时依赖保持为零/最小化；优先使用纯 Node API。
- 保持代码生成纯粹（树 → 字符串），使其始终可做快照测试。
- 行为改动须同步更新文档（`docs/`）；文档对照实现编写，应始终保持真实（参见“已知限制”各节）。
- 提交前必须通过 `pnpm typecheck` 与 `pnpm test`。
