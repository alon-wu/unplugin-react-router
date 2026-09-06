import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from '../src/vite.ts'

export default defineConfig({
  plugins: [
    react(),
    reactRouter({ layouts: { dir: 'src/app', default: 'blank' } }),
  ],
})
