> **简体中文** · [English](../en/file-conventions.md)

# 文件约定

每个页面文件都会在构建/开发时被扫描，并转换成 React Router 的 `RouteObject`。本文档精确说明哪个文件对应哪条路由——下面的规则实现于 `src/core/tree.ts` 与 `src/codegen/generateRouteRecords.ts`。

## 1. 心智模型

一个路由文件夹会被转换成一棵**路径段树**：

- **目录**是一个路径段（除非它是路由组，见 §6），
- 目录内的**文件**是再多一个路径段的叶子路由，
- **`index` 文件**是其父路径的"默认内容"，
- **与所在目录同名的文件**（例如紧挨 `blog/` 的 `blog.tsx`）是该目录路径段的*布局组件*，
- 启用 `layoutFile: 'layout'` 后，目录内的 **`layout.tsx`** 也成为该目录路径段的布局组件（§4d），
- 启用 `dotNesting: true` 后，文件名中的**点**展开为嵌套静态路径段（§5b），
- `[[x]]` 形式的**可选参数文件**会被拆成"无参路由 + 参数路由"两条记录（§5c）。

示例目录树及其生成的路由：

```txt
src/pages/
├── index.tsx            →  index route at the top level        →  /
├── about.tsx            →  static leaf                          →  /about
├── users/
│   ├── index.tsx        →  index route of users                 →  /users
│   └── [id].tsx         →  dynamic leaf                         →  /users/:id
├── docs/
│   └── [[lang]].tsx     →  optional segment                     →  /docs 和 /docs/:lang
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
    path: 'docs',
    children: [
      { index: true, lazy: /* docs/[[lang]].tsx — bare /docs */ },
      { path: ':lang', lazy: /* docs/[[lang]].tsx — /docs/:lang */ },
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
  // about.tsx sorts before blog/* docs/* users/* …
]
```

## 2. 路径段 ↔ 路径映射

| 磁盘上的名称 | 含义 | 生成的路由路径 / 记录 |
| ---------------- | ---------------------------- | ----------------------- |
| `index`（文件） | 父路径的默认内容 | 父记录的一个 `{ index: true }` **子记录**（位于顶层时匹配 `/`） |
| `about` | 静态路径段 | `path: 'about'` |
| `[id]` | 动态参数 | `path: ':id'` |
| `[[lang]]`（文件） | 可选参数 | 拆成两条记录：父路径的 `{ index: true }` + 同文件的 `path: ':lang'`（两条 URL 都懒加载同一个模块） |
| `[[...rest]]`（文件） | 可选兜底 | 拆成两条记录：父路径的 `{ index: true }` + 同文件的 `path: '*'` |
| `[...rest]` | 兜底路由（catch-all） | `path: '*'`（仅可作为**文件**；捕获到的路径值会存入 `params['*']`） |
| `(admin)` | 无路径**路由组** | 完全没有 `path` 属性 |
| `a.b`（默认） | 点是字面字符 | `path: 'a.b'` |
| `users.create`（`dotNesting: true`） | 点的两侧展开为嵌套静态段 | `/users/create`（中间段不产生组件/布局） |

参数名与路由组名仅允许 `[A-Za-z0-9_-]`（正则 `[\w-]+`）。

### 路径段校验（硬错误）

扫描过程中，若某个名称无法用 React Router 的路径语法表达，插件会抛出带提示信息的错误：

| 输入 | 原因 |
| --- | --- |
| `[[id]]`（作为**目录**名） | 可选段只支持文件；目录可选请拆成 `[lang]` 目录或手动拆分 |
| `[id]+`（可重复段） | React Router 不支持；兜底路由（catch-all）文件 `[...rest]` 是最接近的替代 |
| `prefix-[id]`、`[a][b]`、`x_[id]`（部分参数/多参数） | React Router 的参数须占满整个路径段 |
| `(name).tsx`（路由组文件） | 路由组是目录；无路径布局请使用 `(name)/index.tsx` |
| 名为 `[...x]` 的目录 | 兜底路由（catch-all）必须是文件（在目录内使用 `[...x].tsx`） |
| 名为 `index` 的目录 | 请改为在父目录内放一个 `index` 文件 |
| 包含 `:` `*` `?` 的静态路径段 | 与 React Router 的路径语法冲突 |
| `dotNesting` 下 `a..b`、`users.[id]` | 点两侧必须是非空静态名；参数/兜底/路由组须是完整段 |

完整错误信息见 [API 参考 → 错误](api.md)。

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

共有四种创建共享 UI 的方式，都要求布局组件中显式放置 `<Outlet />`，子内容才会渲染。

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

### 4d. 布局特殊文件（`layoutFile` 选项，可选）

启用 `layoutFile: 'layout'` 后，每个目录里的 `layout.tsx` 成为该路径段的布局组件，与 4a 的"同名文件"二选一（两者同时存在会报错）：

```ts
// vite.config.ts
reactRouter({
  layoutFile: 'layout',
})
```

```txt
src/pages/
├── layout.tsx        # 根布局（pathless wrapper）：包裹下面所有路由（含 /）
├── blog/
│   ├── layout.tsx    # blog 段的布局组件（不再需要 blog.tsx）
│   ├── index.tsx     # /blog
│   └── [slug].tsx    # /blog/:slug
└── about.tsx         # /about（渲染在根 layout.tsx 的 <Outlet/> 里）
```

规则：

- 根目录的 `layout.tsx` 生成一条**无路径顶层路由**，所有其它路由（包括 `/` 的 index 路由）都作为它的子路由渲染（需要 `<Outlet/>`）；
- 启用期间 `layout` 是保留名：不能再有静态 `/layout` 页面；把该文件名当作页面需要关闭选项或改用路由组；
- 与 4a 语义一致，路径段级 `layout.tsx` 之外仍可用 `(group)/index.tsx` 做无路径布局。

## 5. 动态段、可选参数、兜底与点嵌套

### 5a. 动态段与兜底路由（catch-all）

```txt
src/pages/
├── products/
│   └── [sku].tsx          # /products/:sku
├── catalog/
│   └── [...rest].tsx      # /catalog/*  (any remaining path)
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

### 5b. 点嵌套（`dotNesting: true`，可选）

启用后，文件名中的点展开为**嵌套静态路径段**（不产生任何 UI 嵌套或布局）：

```ts
reactRouter({ dotNesting: true })
```

```txt
src/pages/
├── settings.profile.tsx     # /settings/profile —— 一条叶子路由，无中间布局
└── admin.users.index.tsx    # /admin/users —— 最后一段是 index 语义
```

规则：

- 点两侧必须是**非空静态名**（`[A-Za-z0-9_-]` 之外允许普通 Unicode 字符，但不得包含 `:` `*` `?` `[` `]` `(` `)`）；
- 参数/兜底/路由组必须保持完整段：写 `users/[id].tsx`，不要写 `users.[id].tsx`；
- 与同路径的目录/同名文件冲突时按既有规则报错（Duplicate layout 等）；
- 关闭该选项时，点按字面字符处理：`a.b.tsx` → `/a.b`（v0.1 行为）。

### 5c. 可选参数 `[[x]]`（文件级）

`[[lang]].tsx`（或 `[[...rest]].tsx`）表示这段路径**可有可无**：插件自动拆成两条路由，都懒加载同一个模块：

```txt
src/pages/docs/
└── [[lang]].tsx
```

等价于：

```js
{
  path: 'docs',
  children: [
    { index: true, lazy: /* docs/[[lang]].tsx — /docs */ },
    { path: ':lang', lazy: /* docs/[[lang]].tsx — /docs/:lang */ },
  ],
}
```

规则：

- **只支持文件**：`[[lang]]` 作为目录名会报错；
- 目录里已有 `index.tsx` 时不能再放 `[[lang]].tsx`（无参 URL 已被 index 占据）→ Duplicate index 错误；
- `[[x]]` 与 `[x]` 并存（同目录）会冲突报错；
- 可选文件的 `export const route` 只允许 `handle`（`path`/`caseSensitive` 语义不明会被拒绝，见 [路由模块](route-modules.md)）。

## 6. 路由组 `(name)`

- 路由组**不贡献**任何路径段。
- 存在 `(name)/index.tsx` 时，该路由组就是一个无路径**布局**（4b）。
- 没有 index 时，路由组是透明的：它的子路由会被收进一个不含组件的无路径记录中（直接透传渲染，见 §3 说明）。
- 路由组套路由组、路由组与普通目录混用，均可递归处理。

```txt
src/pages/
├── (auth)/
│   ├── layout.tsx?  # ✗ 默认不是特殊文件——(auth)/index.tsx 才是组布局
│   └── login.tsx    # /login
└── (docs)/
    ├── index.tsx    # pathless layout for /guides, /reference
    ├── guides.tsx   # /guides
    └── reference.tsx# /reference
```

> 若启用了 `layoutFile`，`(name)/layout.tsx` 也能充当组布局，但不能与 `(name)/index.tsx` 同时存在（两者都声称拥有组的无路径布局）。

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
- 各文件夹的 `extensions` / `exclude` / `filePatterns` 会覆盖全局配置（传入函数可以基于全局值扩展，而非替换它）。
- `exclude` 的 glob 模式**相对于各文件夹的 `src`**（picomatch 语法），例如 `['**/ignored/**']`。
- `filePatterns`（可选）是**正向**过滤：给出后，只有匹配其中任意一个 glob 的文件才被认为是页面文件（匹配的是相对路径、含扩展名）。例如 `{ src: 'src/pages', filePatterns: ['**/*.page.tsx'] }` 只把 `.page.tsx` 当页面。空数组会报错（等于没有任何文件匹配）。

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
- 兜底路由（catch-all）永远排在最后，
- 被绝对 `path` 覆盖提升到顶层的记录按其路径字符串排序。

同一组页面文件总是产出逐字节一致的输出（有单元测试验证），从而保证快照与 diff 的稳定。

## 10. 与 unplugin-vue-router 命名方式的对比

| unplugin-vue-router (Vue) | unplugin-react-router (this plugin) | 说明 |
| --- | --- | --- |
| `index.vue` → path `''` | `index.tsx` → `{ index: true }` 子记录 | 与"默认内容"语义相同 |
| `users.vue` + `users/` 嵌套 | `users.tsx` + `users/` → 布局 | 布局需要 `<Outlet/>` |
| `[id].vue` | `[id].tsx` | 相同 |
| `[...path].vue` → `/:path(.*)` | `[...rest].tsx` → `'*'` | 参数名不同（`'*'`） |
| `[[id]].vue`（可选） | `[[id]].tsx` → index + `:id` 两条记录 | React Router 无可选段语法，用拆分表达 |
| `[id]+.vue`（可重复） | ❌ 不支持 | React Router 无法表达 |
| `prefix-[id].vue`（部分参数） | ❌ 不支持 | 参数须占满整个路径段 |
| `(group)/` 目录 | `(group)/` 目录 | 这里的 group `index` 表示布局，而非默认内容 |
| `users.create.vue`（点号嵌套，属于 Nuxt 风格） | 默认点原样保留；`dotNesting: true` 时展开为 `/users/create` | React Router 无路径级组件，故只有无 UI 嵌套展开 |
| 具名视图 `index@aux.vue` | ❌ 不支持 | React Router 中没有 Vue 具名视图 |
| `<route>` 块 / `definePage` | 模块具名导出 + `export const route` 覆盖 | 见 [路由模块](route-modules.md) |
| 路由**名称** + 类型化 router | 无名称；提供 `AppRoutePath`/`RouteParams` 类型面 | React Router 没有命名路由 |

## 11. Playground 示例

仓库中的 playground（`playground/src/pages`）实践了 index、参数、兜底路由（catch-all）、路由组布局、仅整理用路由组、同名布局等约定。单元测试与 SSR 端到端测试的 fixtures（`tests/fixtures/`）额外覆盖了可选参数 `[[chapter]]`、`path` 覆盖、根 `layout.tsx` 与点嵌套页面——它们是最新的可运行参考。

## 12. 声明式布局（v0.3，`layouts` 选项）

布局组件集中在插件之外的目录（如 `src/app/`），页面平铺在 `src/pages`、用
代码声明"我挂哪个布局"——这是 Vue 生态 `definePage`/layouts 心智在 React 侧
的等价物。

```ts
// vite.config.ts
reactRouter({
  layouts: { dir: 'src/app', default: 'blank' },
})
```

```txt
src/app/                  # 布局目录（相对 root；可按任意层级分布）
├── blank.tsx             # 默认壳：default 指向它，未声明页面都包进来
├── admin.tsx             # 业务壳
└── components/           # 跳过——其中的 .tsx 不会被当作布局
src/pages/                # 页面照旧平铺/分目录
├── login.tsx             # 未声明 → 自动进 blank 壳
└── dashboard.tsx         # 声明 layout:'admin' → 提出并进 admin 壳
```

规则：

- **启用与默认**：配置了 `layouts` 即开启；`dir` 目录必须存在，且递归可发现
  名为 `default` 的布局文件（`blank`），否则构建期报错。
- **布局发现**：在 `dir` 下**任意深度**按文件名匹配 `<id>.tsx`/`.jsx`；
  跳过名为 `components` 的目录与点/下划线开头目录；同名冲突报错。
- **默认壳**：所有未声明 `route.layout` 的**顶层成员**（顶层页面文件、顶层
  目录/组块、首页 `index.tsx`、`[...rest]` 404）聚合进 `default` 壳。
- **换壳**：页面声明 `export const route = { layout: 'admin' }` → 该顶层成员
  从默认壳提出，放进平级的 `admin` 壳（同布局共享一个懒加载壳）。
  URL/参数/`handle` 均不变。
- **顶层成员粒度与混用**：布局声明以**顶层成员**为单位——一个顶层目录块内
  的所有页面必须一致（全未声明 → 默认；全同一布局 → 该布局）；混用会构建期
  报错（提示拆成独立顶层文件或用路由组）。
- **catch-all 保留在默认壳**：`[...rest].tsx` 页面不能声明 `layout`
  （否则会产生第二个全局兜底、永不匹配）；声明会报错。
- **与目录布局互斥**：`layouts` 开启期间，目录不再表达布局——同名目录布局
  （§4a）、组内 `index` 壳（§4b 的"壳"含义）、`layoutFile`（§4d）若出现会被
  报错并提示改用声明；`index.tsx` 作为"默认内容"不受影响。
- **页面写法**：`RouteConfig.layout?: string`（与 `path`/`caseSensitive` 同属
  构建期静态读取；未开启 `layouts` 时该键无效果）。

```tsx
// src/pages/dashboard.tsx
export const route = { layout: 'admin' }
export default function Dashboard() { … }
```

> `src/app` 中的布局组件是普通的 React 组件，内含 `<Outlet/>` 渲染被包裹的
> 页面；不要在 `src/pages` 下放置布局文件。
