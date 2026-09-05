> **简体中文** · [English](../en/file-conventions.md)

# 文件约定

每个页面文件都会在构建/开发时被扫描，并转换成 React Router 的 `RouteObject`。本文档精确说明哪个文件对应哪条路由——下面的规则实现于 `src/core/tree.ts` 与 `src/codegen/generateRouteRecords.ts`。

## 1. 心智模型

一个路由文件夹会被转换成一棵**路径段树**：

- **目录**是一个路径段（除非它是路由组，见 §6），
- 目录内的**文件**是再多一个路径段的叶子路由，
- **`index` 文件**是其父路径的"默认内容"，
- **与所在目录同名的文件**（例如紧挨 `blog/` 的 `blog.tsx`）是该目录路径段的*布局组件*。

示例目录树及其生成的路由：

```txt
src/pages/
├── index.tsx            →  index route at the top level        →  /
├── about.tsx            →  static leaf                          →  /about
├── users/
│   ├── index.tsx        →  index route of users                 →  /users
│   └── [id].tsx         →  dynamic leaf                         →  /users/:id
├── blog.tsx             →  layout of the blog segment           →  /blog (with children)
└── blog/
    ├── index.tsx        →  index route of blog                  →  /blog
    └── [slug].tsx       →  dynamic leaf                         →  /blog/:slug
├── (shop)/…             →  pathless group (no URL segment)
└── [...rest].tsx        →  catch-all                             →  *
```

生成的模块（针对上面的目录树做了简化）：

```js
export const routes = [
  { index: true, lazy: /* index.tsx */ },
  {
    path: 'users',
    children: [
      { index: true, lazy: /* users/index.tsx */ },
      { path: ':id', lazy: /* users/[id].tsx */ },
    ],
  },
  {
    path: 'blog',
    lazy: /* blog.tsx — layout */,
    children: [
      { index: true, lazy: /* blog/index.tsx */ },
      { path: ':slug', lazy: /* blog/[slug].tsx */ },
    ],
  },
  { path: '*', lazy: /* [...rest].tsx */ },
  // about.tsx sorts before blog/* users/* …
]
```

## 2. 路径段 ↔ 路径映射

| 磁盘上的名称 | 含义 | 生成的路由路径 / 记录 |
| ---------------- | ---------------------------- | ----------------------- |
| `index`（文件） | 父路径的默认内容 | 父记录的一个 `{ index: true }` **子记录**（位于顶层时匹配 `/`） |
| `about` | 静态路径段 | `path: 'about'` |
| `[id]` | 动态参数 | `path: ':id'` |
| `[...rest]` | 兜底路由（catch-all） | `path: '*'`（仅可作为**文件**；捕获到的路径值会存入 `params['*']`） |
| `(admin)` | 无路径**路由组** | 完全没有 `path` 属性 |
| `a.b` | 点是字面字符 | `path: 'a.b'` |

参数名与路由组名仅允许 `[A-Za-z0-9_-]`（正则 `[\w-]+`）。

### 路径段校验（硬错误）

扫描过程中，若某个名称无法用 React Router 的路径语法表达，插件会抛出带提示信息的错误：

| 输入 | 原因 |
| --- | --- |
| `[[id]]`（可选段） | React Router 没有可选路径段语法；请拆分为 `index` + `[id]` |
| `[id]+`（可重复段） | 同上；兜底路由（catch-all）文件 `[...rest]` 是最接近的替代 |
| `prefix-[id]`、`[a][b]`、`x_[id]`（部分参数/多参数） | React Router 的参数须占满整个路径段 |
| `(name).tsx`（路由组文件） | 路由组是目录；无路径布局请使用 `(name)/index.tsx` |
| 名为 `[...x]` 的目录 | 兜底路由（catch-all）必须是文件（在目录内使用 `[...x].tsx`） |
| 名为 `index` 的目录 | 请改为在父目录内放一个 `index` 文件 |
| 包含 `:` `*` `?` 的静态路径段 | 与 React Router 的路径语法冲突 |

完整的错误信息见 [API 参考 → 错误](api.md)。

## 3. Index 路由——"默认内容"，而非布局

`index.tsx` **只**在它自己的路径上渲染；它**不会**包裹同级路由。

```txt
src/pages/users/
├── index.tsx      # /users            — the users list
└── [id].tsx       # /users/:id        — the detail page
```

- `/users` 渲染 `index.tsx`。
- `/users/42` **单独**渲染 `[id].tsx`——`index.tsx` 不参与其中，也没有额外的布局层。

这与 `unplugin-vue-router`（以及 Next.js 的 `page.tsx`）语义一致：同级文件彼此独立。

> ⚠️ 由于父级 `users` 记录**没有组件**，React Router 会直接透传渲染它的子路由（已对照渲染器验证：当匹配到的路由既没有 `Component` 也没有 `element` 时，子路由会被直接透传）。这里不存在隐藏的 `<Outlet/>` 要求。

## 4. 布局

共有三种创建共享 UI 的方式，三者都要求布局组件中显式放置 `<Outlet />`，子内容才会渲染。

### 4a. 同名文件与文件夹布局

```txt
src/pages/
├── blog.tsx        # layout component of the blog segment
└── blog/
    ├── index.tsx   # /blog            — rendered inside <Outlet/>
    └── [slug].tsx  # /blog/:slug      — rendered inside <Outlet/>
```

```tsx
// blog.tsx
import { Outlet } from 'react-router'

export default function BlogLayout() {
  return (
    <div>
      <header>Blog</header>
      <Outlet />   {/* index.tsx or [slug].tsx renders here */}
    </div>
  )
}
```

- `/blog` 渲染布局 + `blog/index.tsx`。
- `/blog/hello` 渲染布局 + `blog/[slug].tsx`。

文件先后顺序无关紧要：只要同名文件与目录在扫描期间成对出现，插件就会将它们合并。

### 4b. 无路径路由组布局

```txt
src/pages/(shop)/
├── index.tsx     # layout component of the (shop) group
├── cart.tsx      # /cart
└── checkout.tsx  # /checkout
```

路由组不会增加 URL 路径段，因此路由组中的 `index.tsx` 是一种**无路径布局**：`/cart` 会渲染 `(shop)/index.tsx`（内含 `<Outlet/>`）并包裹 `cart.tsx`，而 URL 仍然是 `/cart`。

### 4c. 完全没有布局

既没有 `index` 也没有同名文件的目录，只是纯粹的整理用命名空间，只把自己的路径段贡献给 URL：

```txt
src/pages/docs/
└── [slug].tsx     # /docs/:slug, no layout wrapper
```

仅用于整理的纯路由组也属于这一类：

```txt
src/pages/(admin)/
└── dashboard.tsx  # /dashboard — (admin) contributes no segment and no layout
```

## 5. 动态段与兜底路由（catch-all）

```txt
src/pages/
├── products/
│   └── [sku].tsx          # /products/:sku
├── catalog/
│   └── [...rest].tsx      # /catalog/*  (any remaining path)
├── users/
│   └── [id].edit.tsx      # ⚠️ ERROR — partial segment
└── [...rest].tsx          # /*          top-level 404 catch-all
```

在路由模块中读取参数：

```tsx
// products/[sku].tsx
import { useParams } from 'react-router'

export default function Product() {
  const { sku } = useParams()      // string | undefined
  return <h1>{sku}</h1>
}
```

兜底路由（catch-all）说明：

- 生成的路由路径是 `'*'`；被捕获的剩余路径存放在 `params['*']`（React Router 语义），**不是** `params.rest`。
- 兜底路由（catch-all）文件不能包含子路由，也不能是目录。
- 在同级记录中，兜底路由（catch-all）总是被**最后**输出（React Router 反正会把它排在最低优先级；我们借此保证输出确定性）。

## 6. 路由组 `(name)`

- 路由组**不贡献**任何路径段。
- 存在 `(name)/index.tsx` 时，该路由组就是一个无路径**布局**（4b）。
- 没有 index 时，路由组是透明的：它的子路由会被收进一个不含组件的无路径记录中（直接透传渲染，见 §3 说明）。
- 路由组套路由组、路由组与普通目录混用，均可递归处理。

```txt
src/pages/
├── (auth)/
│   ├── layout.tsx?  # ✗ not special — groups have no layout file convention;
│   │                #   use (auth)/index.tsx for the layout component
│   └── login.tsx    # /login
└── (docs)/
    ├── index.tsx    # pathless layout for /guides, /reference
    ├── guides.tsx   # /guides
    └── reference.tsx# /reference
```

## 7. 多个路由文件夹与前缀

```ts
reactRouter({
  routesFolder: [
    'src/pages',
    {
      src: 'src/docs/pages',
      // every route of this folder is prefixed
      path: 'docs',
    },
    {
      src: 'src/legacy',
      path: 'docs/[lang]',      // parameterised prefixes are supported
      exclude: ['**/secret/**'],
    },
  ],
})
```

规则：

- `path` 以 `/` 拼接，**不能**以 `/` 开头，且可包含 `[param]` 路径段（它们与目录路径段一样被解析）。它会创建不含组件的前缀记录——子路由直接透传渲染（无布局）。
- 各文件夹按顺序被扫描进同一棵树。不同文件夹之间的相同路由会产生重复文件错误（见"错误"一节）；请使用不同的前缀。
- 各文件夹的 `extensions` / `exclude` 会覆盖全局配置（传入函数可以基于全局值扩展，而非替换它）。
- `exclude` 的 glob 模式**相对于各文件夹的 `src`**（picomatch 语法），例如 `['**/ignored/**']`。

## 8. 自定义扩展名

```ts
reactRouter({
  extensions: ['.tsx', '.jsx', '.ts'],   // global default
})
```

说明：

- 扩展名按后缀匹配；当多个后缀同时匹配时，**最长**的后缀胜出（这样未来即使支持 `.page.tsx` 这类风格也不会有歧义）。
- 只有去掉所匹配后缀后的文件名才会成为路径段：`[id].tsx` 配 `.tsx` → `[id]`；`about.mdx` 配 `.mdx` → `about`。
- 以 `.` 开头的文件夹会被扫描器跳过（点文件一律忽略）。

## 9. 排序与确定性

生成的记录按确定性规则排序：

- 同级记录按原始名称排序（字符串顺序），
- 兜底路由（catch-all）永远排在最后。

同一组页面文件总是产出逐字节一致的输出（有单元测试验证），从而保证快照与 diff 的稳定。

## 10. 与 unplugin-vue-router 命名方式的对比

| unplugin-vue-router (Vue) | unplugin-react-router (this plugin) | 说明 |
| --- | --- | --- |
| `index.vue` → path `''` | `index.tsx` → `{ index: true }` 子记录 | 与"默认内容"语义相同 |
| `users.vue` + `users/` 嵌套 | `users.tsx` + `users/` → 布局 | 布局需要 `<Outlet/>` |
| `[id].vue` | `[id].tsx` | 相同 |
| `[...path].vue` → `/:path(.*)` | `[...rest].tsx` → `'*'` | 参数名不同（`'*'`） |
| `[[id]].vue`、`[id]+.vue` | ❌ 不支持 | React Router 无法表达它们 |
| `prefix-[id].vue`（部分参数） | ❌ 不支持 | 参数须占满整个路径段 |
| `(group)/` 目录 | `(group)/` 目录 | 这里的 group `index` 表示布局，而非默认内容 |
| `users.create.vue` 点号嵌套 | 点号原样保留 | 不隐式按 `/` 拆分（v0.1） |
| 具名视图 `index@aux.vue` | ❌ 不支持 | React Router 中没有 Vue 具名视图 |
| `<route>` 块 / `definePage` | 模块具名导出 | 见 [路由模块](route-modules.md) |
| 路由**名称** + 类型化 router | 无名称 | React Router 没有命名路由 |

## 11. Playground 示例

仓库中的 playground（`playground/src/pages`）实践了上述每一条规则——index、参数、兜底路由（catch-all）、路由组布局、仅整理用路由组、同名布局——是每种约定应如何使用的参照：

```txt
playground/src/pages/
├── index.tsx
├── about.tsx
├── users/index.tsx
├── users/[id].tsx
├── blog.tsx
├── blog/index.tsx
├── blog/[slug].tsx
├── (shop)/index.tsx
├── (shop)/cart.tsx
├── (shop)/checkout.tsx
├── (admin)/dashboard.tsx
└── [...rest].tsx
```
