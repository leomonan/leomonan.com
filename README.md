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
| `src/pages/index.astro` | Public website |
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
