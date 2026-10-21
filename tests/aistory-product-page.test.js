import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { getMessages, localizedPath, SITE_URL } from '../src/i18n/index.js';
import { STORY_VIEWS } from '../src/lib/aistory-fan3d-layout.js';
const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('both public pages use one shared layout and one shared 3D showcase', async () => {
  for (const path of ['src/views/HomePage.astro', 'src/views/AIStoryPage.astro']) {
    const source = await read(path);
    assert.equal((source.match(/<SiteLayout(?:\s|>)/g) || []).length, 1);
    assert.equal((source.match(/<AIStoryReal3DFan\s+locale=\{locale\}\s*\/>/g) || []).length, 1);
    assert.ok(!source.includes('new THREE.') && !source.includes('WebGLRenderer'));
    assert.equal((source.match(/<main\s/g)||[]).length,1);
  }
});

test('home provides real AIStory links without hijacking the carousel', async () => {
  const home = await read('src/views/HomePage.astro');
  assert.match(home, /href=\{productPath\} data-aistory-entry/);
  assert.match(home, /class="focus-row focus-link" href=\{productPath\}/);
  assert.ok(!home.includes('onclick='));
});

test('product workflow reuses all four real source screens and existing crop contract', async () => {
  const page = await read('src/views/AIStoryPage.astro');
  assert.match(page, /STORY_VIEWS\.find/);
  for (const locale of ['en', 'zh']) {
    const ids = getMessages(locale).product.steps.map(step => step.id);
    assert.deepEqual([...ids].sort(), STORY_VIEWS.map(view => view.id).sort());
  }
  assert.match(page, /src: `\/images\/work\/aistory-\$\{step.id\}\.webp`/);
  assert.match(page, /target="_blank" rel="noopener"/);
});

test('page-specific metadata and cross-page home links are explicit', async () => {
  const layout = await read('src/layouts/SiteLayout.astro');
  assert.match(layout, /new URL\(path, SITE_URL\)/);
  assert.equal(SITE_URL, 'https://leomonan.com');
  assert.match(layout, /class="brand" href=\{homePath\}/);
  assert.ok(layout.includes("href: homePath + '#work'"));
  assert.equal(localizedPath('en', 'home') + '#work', '/#work');
  assert.equal(localizedPath('zh', 'home') + '#work', '/zh/#work');
  const product = await read('src/views/AIStoryPage.astro');
  assert.match(product, /page="aistory"/);
  assert.ok(product.includes("href={homePath + '#work'}"));
});

test('development page does not invent a release, email, signup, or playable demo', async () => {
  const page = await read('src/views/AIStoryPage.astro');
  assert.match(getMessages('en').common.active, /Active development/);
  assert.match(getMessages('en').product.developmentLead, /not an open sign-up or a public app release/);
  assert.match(getMessages('en').product.screensNote, /not play audio or generate stories/);
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
