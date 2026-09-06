import { Outlet } from 'react-router'

// named shell: pages declaring `route.layout = 'admin'` render inside here.
export default function AdminLayout() {
  return (
    <div data-testid="shell">
      <header>ADMIN SHELL</header>
      <Outlet />
    </div>
  )
}
