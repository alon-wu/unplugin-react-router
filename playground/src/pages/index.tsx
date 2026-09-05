import { Link } from 'react-router'

export default function Home() {
  return (
    <main>
      <h1>unplugin-react-router playground</h1>
      <p>File based routing for React Router v8, in the spirit of unplugin-vue-router.</p>
      <nav>
        <ul>
          <li>
            <Link to="/users">Users list (index route)</Link>
          </li>
          <li>
            <Link to="/users/42">User detail (dynamic segment + loader)</Link>
          </li>
          <li>
            <Link to="/blog">Blog (layout + index)</Link>
          </li>
          <li>
            <Link to="/blog/hello-world">Blog post (loader + ErrorBoundary)</Link>
          </li>
          <li>
            <Link to="/shop">Shop (route group layout)</Link>
          </li>
          <li>
            <Link to="/dashboard">Dashboard (route group, flat file)</Link>
          </li>
          <li>
            <Link to="/this-page-does-not-exist">404 (splat route)</Link>
          </li>
        </ul>
      </nav>
    </main>
  )
}
