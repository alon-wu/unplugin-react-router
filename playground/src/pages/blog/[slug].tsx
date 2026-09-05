import { useLoaderData, useParams, type LoaderFunctionArgs } from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  await new Promise((resolve) => setTimeout(resolve, 30))
  return { title: `Post “${params.slug}”` }
}

export function ErrorBoundary() {
  return <p>This post could not be displayed.</p>
}

export default function BlogPost() {
  const { slug } = useParams()
  const data = useLoaderData() as Awaited<ReturnType<typeof loader>>
  return (
    <article>
      <h2>{data.title}</h2>
      <p>slug = {slug}</p>
    </article>
  )
}
