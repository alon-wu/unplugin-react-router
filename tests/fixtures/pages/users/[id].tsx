import { useLoaderData, type LoaderFunctionArgs } from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  if (params.id === 'bad') {
    throw new Response('not found', { status: 404 })
  }
  return { id: params.id }
}

export function ErrorBoundary() {
  return <div>USER-ERROR</div>
}

export default function FixtureUser() {
  const data = useLoaderData() as { id?: string }
  return <div>USER {data.id}</div>
}
