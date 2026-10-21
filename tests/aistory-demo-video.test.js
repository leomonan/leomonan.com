import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('homepage embeds the test recording after AIStory without replacing its K carousel', async () => {
  const home = await read('src/views/HomePage.astro');
  assert.equal((home.match(/<AIStoryDemoVideo\s+locale=\{locale\}\s*\/>/g)||[]).length, 1);
  assert.equal((home.match(/<AIStoryReal3DFan\s+locale=\{locale\}\s*\/>/g)||[]).length, 1);
  assert.ok(home.indexOf('<AIStoryReal3DFan locale={locale} />') < home.indexOf('<AIStoryDemoVideo locale={locale} />'));
  assert.ok(home.indexOf('<AIStoryDemoVideo locale={locale} />') < home.indexOf('<div class="product-pair">'));
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
  assert.match(source, /getMessages\(locale\)/);
  assert.match(source, /\{demo.kicker\}/);
  assert.match(source, /href=\{demoVideoUrl\}/);
  assert.match(source, /video.addEventListener\('error', showError\)/);
});

test('recording uses a centered portrait frame and respects intrinsic dimensions', async () => {
  const source = await read('src/components/AIStoryDemoVideo.astro');
  const media = source.match(/\n  \.demo-media\s*\{([^}]+)\}/)[1];
  const video = source.match(/\n  video\s*\{([^}]+)\}/)[1];
  assert.match(media, /width:\s*min\(100%,\s*320px\)/);
  assert.match(media, /justify-self:\s*center/);
  assert.match(video, /height:\s*auto/);
  assert.match(video, /aspect-ratio:\s*auto\s+9\s*\/\s*19/);
  assert.match(video, /object-fit:\s*contain/);
  assert.doesNotMatch(video, /max-height|16\s*\/\s*9|object-fit:\s*cover/);
});
