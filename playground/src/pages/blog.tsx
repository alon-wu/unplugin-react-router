import { Outlet, Link } from 'react-router'

/**
 * `blog.tsx` is a *layout file sharing its directory name* (`blog/`): it is
 * the component of the `blog` path segment and wraps its children.
 */
export default function BlogLayout() {
  return (
    <section>
      <header>
        <h1>Blog</h1>
        <p>
          Layout from <code>blog.tsx</code> (file named like its folder). Go
          to <Link to="/blog/hello-world">a post</Link> or the{' '}
          <Link to="/blog">index</Link>.
        </p>
      </header>
      <Outlet />
    </section>
  )
}
