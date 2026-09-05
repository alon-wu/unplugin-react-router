import { Outlet, Link } from 'react-router'

/**
 * `(shop)/index.tsx` is the *component of a pathless route group*: it wraps
 * every route inside `(shop)/` with a shared layout.
 */
export default function ShopLayout() {
  return (
    <section>
      <h1>Shop</h1>
      <p>
        Layout from <code>(shop)/index.tsx</code> (route group, no URL
        segment). Children render in the <code>&lt;Outlet/&gt;</code>.
      </p>
      <nav>
        <Link to="/cart">Cart</Link> · <Link to="/checkout">Checkout</Link>
      </nav>
      <Outlet />
    </section>
  )
}
