import { Outlet } from 'react-router'

// root layout special file (layoutFile: 'layout') → pathless wrapper
export default function E2ERootLayout() {
  return (
    <div data-testid="root-layout">
      <header>ROOT-LAYOUT</header>
      <Outlet />
    </div>
  )
}
