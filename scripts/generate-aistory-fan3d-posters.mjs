/*
 * Render AIStory fallback posters from the actual production Three.js scene.
 * The posters have ZERO separate phone geometry/positions; each is a capture
 * of the initial WebGL frame at the exact CSS responsive stage size.
 *
 * Regenerate after changing camera, lighting, model or initial screen texture.
 * Usage: node scripts/generate-aistory-fan3d-posters.mjs
 * Requires locally available Chrome, playwright-core and sharp (CI installs
 * these temporarily; they do not become runtime dependencies).
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const BASE = process.env.POSTER_BASE_URL || 'http://127.0.0.1:4321/';
const DIR = 'public/images/work';
const targets = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'tablet', width: 1024, height: 900 },
  { name: 'small', width: 640, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--no-sandbox', '--enable-webgl', '--use-gl=angle',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
  ],
});

await mkdir(DIR, { recursive: true });
try {
  for (const target of targets) {
    const page = await browser.newPage({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE + '#work', { waitUntil: 'domcontentloaded' });
    await page.locator('.flagship-card').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-real-fan]');
      return !!root?.querySelector('canvas.real-fan-canvas') &&
        !root?.querySelector('[data-real-fan-tab="1"]')?.disabled &&
        root?.querySelector('[data-real-fan-status]')?.textContent?.includes('Episode centered');
    }, null, { timeout: 70000 });

    // Prevent autonomous turn during capture, but do not change the geometry.
    await page.locator('[data-real-fan]').hover();
    await page.waitForTimeout(150);

    // Isolate the genuinely transparent WebGL canvas from the page's lavender
    // background; poster must be transparent so the card can own its background.
    await page.addStyleTag({ content:
      'html, body, body * {' +
      'background: transparent !important;' +
      'background-image: none !important;' +
      'box-shadow: none !important;' +
      '}'
    });

    const canvas = page.locator('canvas.real-fan-canvas');
    const rect = await canvas.boundingBox();
    assert.ok(rect && rect.width > 200 && rect.height > 300);
    const buffer = await page.screenshot({
      clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      omitBackground: true,
      animations: 'disabled',
      type: 'png',
    });

    const image = sharp(buffer);
    const meta = await image.metadata();
    assert.ok(meta.hasAlpha, 'Fallback poster must retain alpha');
    const stats = await image.stats();
    const alpha = stats.channels[3];
    assert.ok(alpha.min === 0,
      'Backdrop is not transparent; remove page background while capturing');
    assert.ok(alpha.max >= 245,
      'Phone silhouettes are absent from generated poster');
    assert.ok(alpha.mean > 8 && alpha.mean < 210,
      'Unexpected alpha coverage: ' + alpha.mean);

    const asset = DIR + '/aistory-fan3d-poster-' + target.name + '.webp';
    const info = await sharp(buffer)
      .webp({ quality: 90, alphaQuality: 100, effort: 5 })
      .toFile(asset);

    assert.deepEqual(errors, [], 'Browser errors: ' + JSON.stringify(errors));
    console.log('POSTER_' + target.name.toUpperCase() + '_PASS=' +
      JSON.stringify({
        size: info.size, width: meta.width, height: meta.height,
        alphaMin: alpha.min, alphaMax: alpha.max,
        alphaMean: Number(alpha.mean.toFixed(2)),
        stageCSS: [Number(rect.width.toFixed(2)), Number(rect.height.toFixed(2))],
        image: asset,
      }));
    await page.close();
  }
} finally {
  await browser.close();
}
