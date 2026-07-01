import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = import.meta.dirname
const ARTICLE = resolve(ROOT, 'article.html')

/**
 * Serve the GA4/GTM-instrumented static article at `/` (and `/index.html`)
 * without running it through Vite's HTML pipeline — the exported file is a
 * self-contained deliverable and must NOT be parsed/rewritten or have the HMR
 * client injected. In dev it is streamed raw by a middleware; at build time it
 * is copied verbatim to `dist/index.html`.
 *
 * The React authoring tool lives at `app.html` (built to `dist/app.html`).
 */
function staticArticleAtRoot(): Plugin {
  return {
    name: 'static-article-at-root',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url === '/' || url === '/index.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(readFileSync(ARTICLE))
          return
        }
        next()
      })
    },
    closeBundle() {
      copyFileSync(ARTICLE, resolve(ROOT, 'dist/index.html'))
    },
  }
}

// base: './' keeps the React app's asset URLs relative so it opens from any path.
export default defineConfig({
  plugins: [react(), staticArticleAtRoot()],
  base: './',
  build: {
    rollupOptions: {
      // Only the React app is a real HTML entry; the article is copied in
      // verbatim by the plugin above.
      input: { app: resolve(ROOT, 'app.html') },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
})
