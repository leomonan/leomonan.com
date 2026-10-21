# Repository guidance

This is a small **static Astro site** with a **single production Three.js
carousel**. Optimize for clarity and minimal implementation, not frameworks
or new runtime abstractions.

- Node.js 22.22+; install with `npm ci`.
- `npm run dev` starts a foreground Astro dev server.
- `npm test` runs Node's built-in tests; `npm run build` validates production.
- Public pages are `src/pages/index.astro` and `src/pages/aistory.astro`.
  Both reuse the same production 3D component; no isolated lab route.
- Keep exactly one production 3D phone GLB and four source screen WebPs.
- Responsive initial previews are *generated from the same live WebGL scene*,
  not from independent CSS positioning of different phone images.
- For any change to camera/angles/model/lighting/phone screen, regenerate all
  four posters with `scripts/generate-aistory-fan3d-posters.mjs`, then check
  with `scripts/verify-aistory-fan3d-handoff.mjs`. Browser QA scripts need
  `playwright-core` and `sharp` installed temporarily; they are not
  production dependencies.
- This repository intentionally keeps one production `main` branch and no
  historical experiment branches or tags. History must never be rewritten
  for routine maintenance without new explicit owner authorization.
