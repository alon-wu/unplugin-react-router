import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactRouter from '../../src/vite.ts'

// Dedicated Playwright fixture app exercising the base conventions and the
// v0.2 additions: dotNesting + root layoutFile are on; one extra folder uses
// filePatterns (only *.page.tsx is a page); another folder gets a
// parameterised prefix (extra/:scope/…).
export default defineConfig({
  plugins: [
    react(),
    reactRouter({
      dts: false,
      dotNesting: true,
      layoutFile: 'layout',
      routesFolder: [
        'src/pages',
        {
          src: 'src/featured',
          path: 'featured',
          filePatterns: ['**/*.page.tsx'],
        },
        { src: 'src/extra', path: 'extra/[scope]' },
      ],
    }),
  ],
})
