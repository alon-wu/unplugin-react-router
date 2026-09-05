import { useLoaderData, type LoaderFunctionArgs } from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  await new Promise((resolve) => setTimeout(resolve, 30))
  const id = Number(params.id)
  if (Number.isNaN(id)) {
    throw new Response('Unknown user', { status: 404 })
  }
  return { id, name: `User ${id}` }
}

export function ErrorBoundary() {
  return <p>Could not load this user.</p>
}

export default function UserDetail() {
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  return (
    <main>
      <h1>{data.name}</h1>
      <p>
        <code>[id].tsx</code> → <code>/users/:id</code>, data loaded by the{' '}
        <code>loader</code> export of this module.
      </p>
      <p>params.id = {data.id}</p>
    </main>
  )
}
