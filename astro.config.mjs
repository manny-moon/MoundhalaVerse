// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages as a *project* site:
// manny-moon.github.io/MoundhalaVerse
//
// These are only the local defaults; CI overrides both from
// actions/configure-pages, so renaming the repo or attaching a custom domain
// needs no change here. For a custom domain set SITE to that origin and
// BASE to '/'; everything else in the codebase reads these two values.
const SITE = process.env.SITE_URL ?? 'https://manny-moon.github.io';
const BASE = process.env.BASE_PATH ?? '/MoundhalaVerse';

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
    // needed, and rolldown only accepts a function here anyway.
  },
});
