# leomonan.com

Personal product and project website built with [Astro](https://astro.build/) and
[Three.js](https://threejs.org/), deployed to Cloudflare from the `main` branch.

The AIStory showcase is a real 3D carousel with four persistent screen textures
mapped onto **one** iPhone GLB model. It does not use interchangeable 2D
phone-angle images.

## Develop

Node.js 22.22+ is required.

```bash
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`npm test` runs the Node built-in regression tests for the 3D carousel's
camera/entry/exit logic and screen-texture preparation.

## Key files

| Location | Purpose |
| --- | --- |
| `src/pages/index.astro` | Personal website and product entry |
| `src/pages/aistory.astro` | AIStory product overview and development status |
| `src/layouts/SiteLayout.astro` | Shared site shell, tokens and page metadata |
| `src/components/AIStoryReal3DFan.astro` | Homepage 3D showcase with responsive static fallback |
| `src/lib/aistory-fan3d.js` | Three.js renderer, fixed screen textures, animation and error handling |
| `src/lib/aistory-fan3d-layout.js` | Shared scene geometry / camera pose contract |
| `src/lib/aistory-fan3d-texture.js` | Screen-texture correction |
| `public/images/work/aistory-{episode,universe,character,create}.webp` | Four source UI screenshots |
| `public/images/work/aistory-fan3d-poster-*.webp` | Four WebGL-derived responsive loading posters |
| `public/images/work/glb/apple_iphone_18_pro_max_silver_2026.glb` | Only production phone model |
| `scripts/generate-aistory-fan3d-posters.mjs` | Regenerate posters from a real WebGL render |
| `scripts/verify-aistory-fan3d-handoff.mjs` | Compare loading poster with actual 3D render |

When changing camera, lights, phone model, angle or staging, **regenerate all four
posters** from the exact production scene and run the screenshot handoff check.
See `docs/aistory-fan3d-p1p2.md` for the manual QA instructions. Do not
reintroduce separate left/right phone image layouts.

## Deployment and asset rights

Astro builds a static `dist/` for the existing Cloudflare deployment.
The GLB came from a third-party model. Public redistribution requires a
license check; possession of a GLB is not itself proof of distribution rights.

This is a single-production-snapshot repository. Legacy experimental branches,
old pose pictures, and replaced models are not needed for deployment.

## Product-page checks

With a built Astro preview running, run
`node scripts/verify-aistory-product-page.mjs` (temporary `playwright-core` required).
This covers navigation, six viewport widths, full-size screenshots, live WebGL,
no-JavaScript content, reduced motion, and model-load failure.

## Languages

The English URLs remain `/` and `/aistory`; Simplified Chinese is served at
`/zh/` and `/zh/aistory`. All four are statically generated. The header language
links target the equivalent page; JavaScript only preserves its section and query.
Direct links, bookmarks, and ordinary in-site links own the language. There is no
automatic redirect, online translation service, or locale cookie.

- `src/i18n/en.json` and `zh.json`: matching content/UI catalogs. Maintain both.
- `src/i18n/index.js`: locale metadata, canonical routes, and text interpolation.
- `src/views/HomePage.astro` and `AIStoryPage.astro`: one template per page type.
- `src/pages/`: four thin route wrappers plus the generated sitemap endpoint.
- Runtime carousel and clipboard copy come from the selected server-rendered
  catalog. Model geometry, screenshot crops and the Release video are shared.
- Native video-control chrome follows the visitor's browser/OS language. Existing
  product screenshots and recorded audio are not translated by the website.

Run `npm test` and `npm run build`. With preview on port 4321 and temporary
`playwright-core`, run `node scripts/verify-i18n.mjs` for 24 static-layout cases,
8 live WebGL/clipboard/language-switch cases, and both-language failure states.
The recording is blocked from loading in this check. Optionally set
`BROWSER_EXECUTABLE` and `I18N_QA_OUT`.

The existing numeric motion verifier also accepts `K_MOTION_ROUTE`, e.g.
`K_MOTION_ROUTE=/zh/aistory node scripts/verify-aistory-upright-motion.mjs`.
Its angle, timing, visibility, and screen-identity assertions are unchanged.

The numeric motion test uses controlled browser-clock steps to sample real WebGL
frames without software-GPU scheduling gaps. Production animation timing is not
modified; ordinary wall-clock interactions are covered by the bilingual browser
checks and the original carousel handoff checks.
