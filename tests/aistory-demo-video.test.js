import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('homepage embeds the test recording after AIStory without replacing its K carousel', async () => {
  const home = await read('src/pages/index.astro');
  assert.equal((home.match(/<AIStoryDemoVideo\s*\/>/g)||[]).length, 1);
  assert.equal((home.match(/<AIStoryReal3DFan\s*\/>/g)||[]).length, 1);
  assert.ok(home.indexOf('<AIStoryReal3DFan />') < home.indexOf('<AIStoryDemoVideo />'));
  assert.ok(home.indexOf('<AIStoryDemoVideo />') < home.indexOf('<div class="product-pair">'));
});

test('test video uses the supplied Release URL once and native user-initiated controls', async () => {
  const source = await read('src/components/AIStoryDemoVideo.astro');
  const url = 'https://github.com/leomonan/leomonan.com/releases/download/aistory-demo-media-v1/2026-10-21.23.59.08.mov';
  assert.equal(source.split(url).length-1, 1, 'Only one media URL to replace later');
  const tag = source.match(/<video\b[\s\S]*?>/)[0];
  assert.match(tag, /src=\{demoVideoUrl\}/);
  assert.match(tag, /\bcontrols\b/);
  assert.match(tag, /\bplaysinline\b/);
  assert.match(tag, /preload="none"/);
  assert.doesNotMatch(tag, /\b(?:autoplay|muted|loop)\b/);
  assert.match(source, /AIStory \/ Test sample/);
  assert.match(source, /href=\{demoVideoUrl\}/);
  assert.match(source, /video.addEventListener\('error', showError\)/);
});
