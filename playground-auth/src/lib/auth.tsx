// 鉴权核心 —— 整个 demo 的“权限逻辑”都集中在这个文件里。
// 真实项目里，login()/角色数据换成“登录后调用 /api/me 一次”。
import { matchPath } from 'react-router'

export interface MenuNode {
  path: string
  title: string
  children?: MenuNode[]
}

interface RoleConfig {
  role: string
  name: string
  menus: MenuNode[]
  /** 该角色允许访问的路径模式（URL 白名单） */
  allow: string[]
  /** 操作级权限码（按钮用） */
  perms: string[]
}

// 模拟“后端/本地按角色下发的权限”。真实项目：登录后从 /api/me 拿同样结构。
const ROLES: Record<string, RoleConfig> = {
  admin: {
    role: 'admin',
    name: '管理员',
    menus: [
      { path: '/dashboard', title: '工作台' },
      {
        path: '/users',
        title: '用户管理',
        children: [{ path: '/users/create', title: '新建用户' }],
      },
      { path: '/reports', title: '数据报表' },
    ],
    allow: ['/dashboard', '/users', '/users/:id', '/users/create', '/reports'],
    perms: ['user:create', 'user:delete', 'report:view'],
  },
  user: {
    role: 'user',
    name: '普通用户',
    menus: [
      { path: '/dashboard', title: '工作台' },
      { path: '/users', title: '用户管理' }, // 没有“新建用户”子菜单
    ],
    allow: ['/dashboard', '/users', '/users/:id'],
    perms: [], // 没有 user:create —— users 页的新建按钮会消失
  },
}

interface Session {
  role: string
  name: string
  cfg: RoleConfig
}

let session: Session | null = null

export function login(role: string): void {
  const cfg = ROLES[role]
  session = { role, name: cfg.name, cfg }
}

export function logout(): void {
  session = null
}

export function getSession(): Session | null {
  return session
}

/** URL 是否在该角色的允许路径里（支持 /users/:id 这种动态路径） */
export function canAccess(pathname: string): boolean {
  const cfg = session?.cfg
  if (!cfg) return false
  return cfg.allow.some((p) => matchPath(p, pathname) !== null)
}

export function hasPerm(code: string): boolean {
  return session?.cfg.perms.includes(code) ?? false
}

/** 操作级权限组件：无权限时不渲染 children（等价 Vue 的 v-permission） */
export function Auth({
  perm,
  children,
  fallback = null,
}: {
  perm: string
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  return hasPerm(perm) ? <>{children}</> : <>{fallback}</>
}

export { ROLES }
