import { Link } from 'react-router'

export default function NotFound() {
  return (
    <main>
      <h1>404</h1>
      <p>
        <code>src/pages/[...rest].tsx</code> → splat route <code>*</code>.
      </p>
      <Link to="/">Go home</Link>
    </main>
  )
}
