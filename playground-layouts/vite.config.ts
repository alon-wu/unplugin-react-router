import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from '../src/vite.ts'

// v0.3 declarative-layouts example:
//  - layouts live in src/app (layout id = file name, e.g. `admin.tsx`),
//  - pages stay flat in src/pages,
//  - pages without `export const route = { layout }` are wrapped by the
//    default (blank) shell; pages declaring one are moved into that shell.
export default defineConfig({
  plugins: [
    react(),
    reactRouter({
      layouts: { dir: 'src/app', default: 'blank' },
    }),
  ],
})
