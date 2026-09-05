import { useLoaderData, type LoaderFunctionArgs } from 'react-router'

export async function loader({ params }: LoaderFunctionArgs) {
  return { slug: params.slug }
}

export default function FixtureBlogPost() {
  const data = useLoaderData() as { slug?: string }
  return <div>POST {data.slug}</div>
}
