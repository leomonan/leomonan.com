# Repository guidance

This is a small **static Astro site** with a **single production Three.js
carousel**. Optimize for clarity and minimal implementation, not frameworks
or new runtime abstractions.

- Node.js 22.22+; install with `npm ci`.
- `npm run dev` starts a foreground Astro dev server.
- `npm test` runs Node's built-in tests; `npm run build` validates production.
- Public routes are `/`, `/aistory`, `/zh/`, and `/zh/aistory`.
  Thin route files share `src/views/HomePage.astro` and `AIStoryPage.astro`,
  with one production 3D component; no isolated lab route.
- Keep exactly one production 3D phone GLB and four source screen WebPs.
- Responsive initial previews are *generated from the same live WebGL scene*,
  not from independent CSS positioning of different phone images.
- For any change to camera/angles/model/lighting/phone screen, regenerate all
  four posters with `scripts/generate-aistory-fan3d-posters.mjs`, then check
  with `scripts/verify-aistory-fan3d-handoff.mjs`. Browser QA scripts need
  `playwright-core` and `sharp` installed temporarily; they are not
  production dependencies.
- Keep one production `main` branch, without historical experiment branches.
  Retain the owner-created `aistory-demo-media-v1` media Release/tag. Never
  rewrite history during routine maintenance without new owner authorization.

## Bilingual pages

- `/` and `/aistory` remain English. `/zh/` and `/zh/aistory` are Simplified Chinese.
  Route files delegate to two shared views under `src/views/`; do not duplicate
  full pages or add runtime machine translation.
- Maintain matching translation keys and interpolation tokens in both catalogs
  under `src/i18n/`. User-facing error messages, ARIA names, clipboard feedback,
  and page metadata are part of the translation contract.
- Keep locale-scoped navigation, self canonicals, reciprocal hreflang, and the
  single route-based sitemap consistent. Do not force redirects by browser locale.
- Do not change phone geometry or translate screenshots/media while translating
  the site. Preserve the owner-created `aistory-demo-media-v1` Release/tag.
