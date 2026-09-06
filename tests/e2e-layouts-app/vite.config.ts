import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from '../../src/vite.ts'

// v0.3 declarative layouts fixture: default (blank) shell + declared admin.
export default defineConfig({
  plugins: [
    react(),
    reactRouter({
      dts: false,
      layouts: { dir: 'src/app', default: 'blank' },
    }),
  ],
})
