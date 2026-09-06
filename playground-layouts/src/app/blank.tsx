import { Outlet } from 'react-router'

// default shell: wraps every top-level page that does not declare a layout.
export default function BlankLayout() {
  return (
    <div data-testid="shell">
      <header>BLANK SHELL</header>
      <Outlet />
    </div>
  )
}
