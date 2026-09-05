import { Outlet } from 'react-router'

// Root layout special file (layoutFile: 'layout'): a pathless wrapper around
// every route of the folder.
export default function FixtureRootLayout() {
  return (
    <div>
      ROOT-LAYOUT
      <Outlet />
    </div>
  )
}
