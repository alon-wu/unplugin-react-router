// Route-level overrides: the file would be /members/:id but the config
// rewrites the URL to /user/:id and adds a static handle.
export const route = {
  path: '/user/:id',
  handle: { crumb: 'Member' },
}

export default function FixtureMember() {
  return <div>MEMBER</div>
}
