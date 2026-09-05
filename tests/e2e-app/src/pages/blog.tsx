import { Outlet } from 'react-router'

// same-name file+directory layout
export default function BlogLayout() {
  return (
    <section data-testid="blog-layout">
      <h1>E2E-BLOG-LAYOUT</h1>
      <Outlet />
    </section>
  )
}
