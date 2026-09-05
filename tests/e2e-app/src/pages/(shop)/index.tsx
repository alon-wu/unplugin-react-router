import { Outlet } from 'react-router'

// pathless group layout via (shop)/index.tsx
export default function ShopLayout() {
  return (
    <section data-testid="shop-layout">
      <h1>E2E-SHOP-LAYOUT</h1>
      <Outlet />
    </section>
  )
}
