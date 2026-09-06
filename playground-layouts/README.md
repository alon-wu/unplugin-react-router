# playground-layouts

**简体中文** · [English](#english)

声明式布局（v0.3 `layouts`）的完整可运行示例。与根目录的 `playground` 不同，
这里**目录只决定 URL**，布局组件集中在 `src/app/`，页面平铺在 `src/pages`
并用代码声明挂到哪个布局。

## 运行

```bash
pnpm -C playground-layouts dev      # 若 5173 被占用：pnpm -C playground-layouts exec vite --port 5175
```

自动浏览器冒烟（自起 dev + Chrome，一条命令）：

```bash
node tests/scripts/layouts-smoke.mjs   # 从仓库根执行
```

## 目录与规则

```txt
src/app/                  # 布局目录（vite.config 的 layouts.dir）
├── blank.tsx             # 默认壳 default:'blank'：未声明页面都包进来
└── admin.tsx             # 具名壳：声明 layout:'admin' 的页面换到这里
src/pages/                # 页面平铺
├── index.tsx             # /  （BLANK SHELL 内）
├── login.tsx             # /login
├── dashboard.tsx         # /dashboard —— export const route = { layout: 'admin' } → ADMIN SHELL
├── settings.tsx          # /settings
├── users/index.tsx       # /users
├── users/[id].tsx        # /users/:id
└── [...rest].tsx         # 404（BLANK SHELL 内）
```

- 布局文件 = 布局 id（文件名），可放在 `src/app` 任意层级；`components`
  目录会被跳过。
- `layouts` 开启时，目录不再有布局含义；同名目录布局 / `layoutFile` 会报错。
- 冒烟脚本会现场做布局热更验证（新增 `team.tsx` + 声明页 → 免重启可用；
  删除 → 该页报模块加载失败；恢复 → 自愈）。

## English

A runnable example of the v0.3 declarative `layouts` feature. Unlike the root
`playground`, directories only shape URLs here: layout components live under
`src/app/`, pages stay flat under `src/pages` and declare which layout wraps
them in code.

```bash
pnpm -C playground-layouts dev
node tests/scripts/layouts-smoke.mjs   # auto browser smoke (from repo root)
```

Layout id = file name (any depth under `src/app`, `components` dirs skipped).
Undeclared top-level pages land in the `blank` (default) shell; pages with
`export const route = { layout: 'admin' }` move into the `admin` shell.
