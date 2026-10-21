import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { STORY_VIEWS } from '../src/lib/aistory-fan3d-layout.js';
const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('both public pages use one shared layout and one shared 3D showcase', async () => {
  for (const path of ['src/pages/index.astro', 'src/pages/aistory.astro']) {
    const source = await read(path);
    assert.equal((source.match(/<SiteLayout(?:\s|>)/g) || []).length, 1);
    assert.equal((source.match(/<AIStoryReal3DFan\s*\/>/g) || []).length, 1);
    assert.ok(!source.includes('new THREE.') && !source.includes('WebGLRenderer'));
    assert.equal((source.match(/<main\s/g)||[]).length,1);
  }
});

test('home provides real AIStory links without hijacking the carousel', async () => {
  const home = await read('src/pages/index.astro');
  assert.match(home, /href="\/aistory" data-aistory-entry/);
  assert.match(home, /class="focus-row focus-link" href="\/aistory"/);
  assert.ok(!home.includes('onclick='));
});

test('product workflow reuses all four real source screens and existing crop contract', async () => {
  const page = await read('src/pages/aistory.astro');
  assert.match(page, /STORY_VIEWS\.find/);
  for (const view of STORY_VIEWS) assert.ok(page.includes(`id: '${view.id}'`));
  assert.match(page, /src: `\/images\/work\/aistory-\$\{step.id\}\.webp`/);
  assert.match(page, /target="_blank" rel="noopener"/);
});

test('page-specific metadata and cross-page home links are explicit', async () => {
  const layout = await read('src/layouts/SiteLayout.astro');
  assert.match(layout, /new URL\(path, 'https:\/\/leomonan.com'\)/);
  assert.match(layout, /class="brand" href="\/"/);
  assert.match(layout, /href: '\/#work'/);
  const product = await read('src/pages/aistory.astro');
  assert.match(product, /path="\/aistory"/);
  assert.match(product, /href="\/#work"/);
});

test('development page does not invent a release, email, signup, or playable demo', async () => {
  const page = await read('src/pages/aistory.astro');
  assert.match(page, /Active development/);
  assert.match(page, /not an open sign-up or a public app release/);
  assert.match(page, /not play audio or generate stories/);
  assert.match(page, /https:\/\/github.com\/leomonan/);
  assert.ok(!/<(?:form|video|audio|iframe)\b|mailto:/.test(page));
});

test('no new duplicate model or screen assets are added', async () => {
  const root = new URL('../public/images/work/', import.meta.url);
  const names = (await readdir(root)).sort();
  assert.deepEqual(names, ['aistory-character.webp','aistory-create.webp','aistory-episode.webp',
    'aistory-fan3d-poster-desktop.webp','aistory-fan3d-poster-mobile.webp',
    'aistory-fan3d-poster-small.webp','aistory-fan3d-poster-tablet.webp','aistory-universe.webp','glb']);
  assert.deepEqual(await readdir(new URL('glb/', root)), ['apple_iphone_18_pro_max_silver_2026.glb']);
});
