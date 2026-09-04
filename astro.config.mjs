// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages as a *project* site: arcullius.github.io/MannyPort
// If you later point a custom domain at this, set SITE to that origin and
// BASE to '/' — everything else in the codebase reads these two values.
const SITE = process.env.SITE_URL ?? 'https://arcullius.github.io';
const BASE = process.env.BASE_PATH ?? '/MannyPort';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    resolve: {
      alias: {
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
        '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
        '@scripts': fileURLToPath(new URL('./src/scripts', import.meta.url)),
        '@styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
        '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      },
    },
    // three.js is loaded through a dynamic import in src/scripts/app.ts, which
    // is enough to keep it out of the initial page chunk. No manual chunking
    // needed — and rolldown only accepts a function here anyway.
  },
});
