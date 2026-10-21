# AIStory Real 3D Fan — Production Scene and Poster Contract

## Current status

The production homepage imports src/components/AIStoryReal3DFan.astro.
The older isolated P0/model-inspector/three-phone lab routes have been retired:
they were not required by the real homepage, the 3D scene poster generator,
or the browser regression test.

The repository retains only the validated production snapshot on `main`.
Old CSS/WebP poses, alternative phone models, and their historical refs are
not part of the production repository.

## Visual single source of truth

The one authoritative composition comes from these files:

- src/lib/aistory-fan3d-layout.js — FAN_VISUAL camera/model constants and
  mirrored left, center, right, hidden slot poses.
- src/lib/aistory-fan3d.js — actual GLB renderer, lighting, screen textures,
  scene-space rotations, contact shadow and loading lifecycle.
- public/images/work/glb/apple_iphone_18_pro_max_silver_2026.glb — body mesh.
- The existing four front-view WebPs are cropped into *screen-only* textures
  and remain fixed to four device instances. No swapping/crossfading screens.

The first-render fallback and the live canvas are two representations of this
SAME scene. The fallback is NOT a separate CSS arrangement of phone images:

- public/images/work/aistory-fan3d-poster-desktop.webp
- public/images/work/aistory-fan3d-poster-tablet.webp
- public/images/work/aistory-fan3d-poster-small.webp
- public/images/work/aistory-fan3d-poster-mobile.webp

The posters were captured from a real Chrome WebGL frame at representative
1440, 1024, 640 and 390 viewport widths, using the production homepage stage
size. All have transparent backgrounds, with actual stage gradient underneath.
The <picture> element chooses the correct responsive representative.
The poster is displayed until the first actual WebGL paint; thereafter only
the live canvas is shown. GLB/WebGL failure leaves the SAME poster visible.

Intermediate widths may involve small subpixel interpolation differences,
but no alternate design parameters or mismatched phone screenshots.

## Regeneration after scene changes

Run the *existing* poster generator, don't hand-adjust poster positioning:

1. npm ci && npm run build
2. Start a local Astro preview on http://127.0.0.1:4321/
3. npm install --no-save --package-lock=false playwright-core sharp
4. node scripts/generate-aistory-fan3d-posters.mjs
5. node scripts/verify-aistory-fan3d-handoff.mjs

Changes to FAN_VISUAL, camera, lighting, textures, or stage CSS require
regenerating all four posters together and running screenshot comparisons.
The screenshot/QA dependencies are not production runtime dependencies.

## Verified transition constraints

- Four persistent GLB phone objects and four fixed screen materials.
- Foreground depth handoff starts early; no late device popping.
- Left/right screen wash and asymmetric perspective interpolate continuously.
- Automatic rotation, side click raycasting, tabs, keyboard, touch, pause on
  focus/hover, reduced motion and hidden-tab rendering controls remain.
- WebGL render on demand; capped device pixel ratio and static fallback.
- The original camera pill in each WebP is corrected at texture generation,
  while the actual physical Dynamic Island remains part of the model.

## Validation evidence

Chrome screenshots before JavaScript and after WebGL were compared at all four
representative viewport widths. Mean RGB absolute difference on 0–255 pixels:
desktop 2.34, tablet 1.70, small 1.96, mobile 2.21.
These values are within lossy WebP/anti-aliasing differences, not a full
second visual layout. Browser navigation and GLB-failure fallback passed.

## Repository cleanup

As audited on 2026-10-21, the shipped public/images/work tree contains
exactly four original front-view WebPs, four responsive scene posters and
one active silver iPhone GLB. All nine are referenced by the real homepage or
its mandatory loading/fallback path. No old pose files, alternative GLBs,
lab pages or obsolete asset README are shipped. Regression and poster tools
remain available because they protect distinct live-runtime behaviors.

The owner-authorized history compaction leaves one parentless root commit.
Fresh Git clones do not download earlier experiments. GitHub may keep
unreachable objects internally until server garbage collection completes.

## Remaining caution

This GLB originated from a user-uploaded third-party model. Its original
licensing and permission for public model redistribution must be verified
independently of the technical build checks.
