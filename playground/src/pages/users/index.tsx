import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router'

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, 30))
  return { users: [1, 2, 3].map((id) => ({ id, name: `User ${id}` })) }
}

export default function Users() {
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  return (
    <main>
      <h1>Users</h1>
      <p>
        <code>src/pages/users/index.tsx</code> renders at <code>/users</code>{' '}
        (an <code>index</code> route inside the <code>users</code> segment).
      </p>
      <ul>
        {data.users.map((user) => (
          <li key={user.id}>
            <Link to={`/users/${user.id}`}>{user.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
