import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from '../../src/vite.ts'

// Dedicated Playwright fixture app exercising both the base conventions and
// the v0.2 additions (dotNesting + root layoutFile are enabled on purpose).
export default defineConfig({
  plugins: [
    react(),
    reactRouter({
      dts: false,
      dotNesting: true,
      layoutFile: 'layout',
    }),
  ],
})
