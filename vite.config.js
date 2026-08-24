import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project pages are served from /<repo-name>/, so the base must match
// the repository name or every asset request 404s. A local fallback build for the
// viva demo needs base './' instead: run `npm run build:local`, which sets
// VITE_BASE=./ and writes to dist-local/. See docs/DEPLOYMENT.md.
const base = process.env.VITE_BASE ?? '/wealth-inequality-viz/'
const outDir = process.env.VITE_OUT_DIR ?? 'dist'

export default defineConfig({
  base,
  outDir,
  plugins: [react()],
  build: { outDir, sourcemap: true },
})
