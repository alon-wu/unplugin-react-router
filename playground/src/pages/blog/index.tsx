import { useLoaderData, type LoaderFunctionArgs } from 'react-router'

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, 30))
  return { posts: [{ slug: 'hello-world', title: 'Hello World' }] }
}

export default function BlogIndex() {
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  return (
    <ul>
      {data.posts.map((post) => (
        <li key={post.slug}>
          <a href={`/blog/${post.slug}`}>{post.title}</a>
        </li>
      ))}
    </ul>
  )
}
