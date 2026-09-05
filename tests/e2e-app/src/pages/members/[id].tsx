// route-level override: absolute path promotes this to a top-level /member/:id
export const route = {
  path: '/member/:id',
  handle: { crumb: 'Member' },
}

export default function Member() {
  return <h1>E2E-OVERRIDE</h1>
}
