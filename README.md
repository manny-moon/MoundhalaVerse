# The Moundhalaverse

My portfolio, built as a real-time WebGL solar system. Five planets orbit a
procedurally-shaded star; clicking one flies the camera in and opens that
section of my work.

**Live:** https://manny-moon.github.io/MoundhalaVerse
**Plain-text résumé:** https://manny-moon.github.io/MoundhalaVerse/resume

---

## Stack

| | |
|---|---|
| **Framework** | [Astro](https://astro.build) 7 — static output, zero JS shipped for content |
| **Language** | TypeScript (strict) |
| **3D** | [three.js](https://threejs.org) r185 with custom GLSL |
| **Content** | Astro content collections, Zod-validated |
| **Hosting** | GitHub Pages via GitHub Actions |

No CSS framework and no UI library — the design system is about 200 lines of
custom properties in [`src/styles/tokens.css`](src/styles/tokens.css).

## Running it

```bash
npm install
npm run dev      # http://localhost:4321/MoundhalaVerse
npm run build    # type-checks, validates content, writes dist/
npm run preview  # serve the production build
```

Node 22+.

## How it's organised

```
src/
├── content/            # experience.json, projects.json, skills.json
├── content.config.ts   # Zod schemas — a bad entry fails the build
├── lib/site.ts         # profile, education, planet definitions, headlines
├── components/
│   ├── Panel.astro     # the accessible dialog shell every section uses
│   ├── panels/         # About, Experience, Projects, Skills, Contact
│   ├── SceneNav.astro  # the real navigation (keyboard + touch)
│   └── Icon.astro      # inline SVG set, no icon-font CDN
├── scripts/
│   ├── solar-system/   # the WebGL scene
│   │   ├── index.ts        # renderer, composer, raycasting, frame loop
│   │   ├── camera-rig.ts   # idle drift, click-to-fly, intro dolly
│   │   ├── objects/        # star, planet, starfield, nebula
│   │   └── shaders/        # GLSL: noise, planet surfaces, sun, space
│   ├── modals.ts       # focus trap, Escape, hash routing
│   └── typewriter.ts
└── pages/
    ├── index.astro     # the solar system
    └── resume.astro    # the plain, printable route
```

### Content is the source of truth

Everything on the site — every bullet, date and tag — comes from
`src/content/*.json` and `src/lib/site.ts`. Both the interactive site and
`/resume` render from those same files, so the two can't drift apart. Adding a
job is a few lines of JSON; the schema in `content.config.ts` fails the build
if a field is missing or malformed.

### The scene

Every surface is generated in a shader — there are no texture downloads. Simplex
noise drives four surface archetypes (rocky, ocean, gas, icy), each seeded
deterministically from its section id so a given planet looks the same on every
load. The star is layered plasma with granulation and faculae; hovering it
crossfades a portrait into the photosphere.

Rendering cost is chosen once at startup from device capability
([`quality.ts`](src/scripts/solar-system/quality.ts)) rather than adapted
mid-flight, so the frame budget stays predictable: pixel ratio, star count,
sphere tessellation, and whether bloom and the nebula run at all.

### Accessibility

The canvas is `aria-hidden` and entirely decorative. The real navigation is a
row of buttons, so every section is reachable by keyboard, screen reader and
touch. Panels are `role="dialog"` with focus traps and focus restore, arrow
keys move between planets, and each section has its own URL hash. With
`prefers-reduced-motion` the intro flight, orbit drift and typewriter all stop
while the site stays fully usable. If WebGL is missing the canvas is dropped and
a static backdrop takes its place — no content depends on it.

## Deploying

Pushing to `master` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which type-checks, builds and publishes to GitHub Pages.

**This repo's Pages is still on the legacy "deploy from a branch" source.** It
has to be switched to **Settings → Pages → Source → GitHub Actions** before
merging, otherwise Pages keeps serving the repo root — which no longer holds a
built `index.html`.

The site URL and base path come from `actions/configure-pages`, so renaming the
repo or attaching a custom domain needs no code change. Locally the defaults
live at the top of [`astro.config.mjs`](astro.config.mjs).

---

Built by [Emmanuel Moundhala](https://github.com/Arcullius).
