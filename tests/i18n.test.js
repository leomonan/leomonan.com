import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMessages, localizedPath, format, LOCALES, ROUTES, SITE_URL } from '../src/i18n/index.js';
import { STORY_VIEWS } from '../src/lib/aistory-fan3d-layout.js';

function leaves(value, path = '') {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? path + '.' + key : key));
}
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('all translated catalogs have identical keys, nonempty values and placeholders', () => {
  const english = leaves(getMessages('en'));
  for (const locale of Object.keys(LOCALES)) {
    const copy = leaves(getMessages(locale));
    assert.deepEqual(copy.map(([key]) => key), english.map(([key]) => key));
    for (const [index, [key, value]] of copy.entries()) {
      assert.ok(value.trim(), `${locale}.${key} must not be empty`);
      assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(),
        [...english[index][1].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), `${locale}.${key} placeholders`);
    }
  }
});

test('existing URLs stay unchanged and Chinese routes are explicit', () => {
  assert.equal(localizedPath('en','home'), '/');
  assert.equal(localizedPath('en','aistory'), '/aistory');
  assert.equal(localizedPath('zh','home'), '/zh/');
  assert.equal(localizedPath('zh','aistory'), '/zh/aistory');
  assert.equal(SITE_URL, 'https://leomonan.com');
  assert.equal(new Set(Object.values(ROUTES).flatMap(Object.values)).size, 4);
  assert.throws(() => getMessages('constructor'), RangeError);
  assert.throws(() => localizedPath('zh-Hant', 'home'), RangeError);
  assert.throws(() => localizedPath('zh', 'missing'), RangeError);
});

test('translation placeholders use text and require their declared arguments', () => {
  assert.equal(format(getMessages('zh').fan.showView, {view:'角色'}),'在中央手机上显示角色');
  assert.throws(() => format('{missing}', {}), /Missing message/);
  assert.equal(format('{view}', {view:'<b>text</b>'}), '<b>text</b>');
});

test('all four routes are thin wrappers around exactly two templates', async () => {
  for (const [path, view, locale] of [
    ['src/pages/index.astro','HomePage','en'],['src/pages/aistory.astro','AIStoryPage','en'],
    ['src/pages/zh/index.astro','HomePage','zh'],['src/pages/zh/aistory.astro','AIStoryPage','zh'],
  ]) {
    const source = await read(path);
    assert.ok(source.includes(`<${view} locale="${locale}" />`));
    assert.ok(source.length < 150);
    assert.ok(!source.includes('<style>'));
  }
  for (const view of ['HomePage','AIStoryPage']) {
    const source = await read(`src/views/${view}.astro`);
    assert.ok(source.includes('<AIStoryReal3DFan locale={locale} />'));
    assert.ok(source.includes('<ContactActions locale={locale}'));
    assert.ok(!source.includes('set:html'));
  }
});

test('all locales address the same story IDs and source images', () => {
  for (const locale of Object.keys(LOCALES)) {
    const copy = getMessages(locale);
    assert.deepEqual(Object.keys(copy.fan.labels).sort(), STORY_VIEWS.map(v => v.id).sort());
    assert.deepEqual(copy.product.steps.map(v => v.id), ['create','character','episode','universe']);
    assert.ok(copy.product.steps.every(v => v.alt.trim()));
  }
});

test('selected-language UI copy is serialized once rather than importing full catalogs in the WebGL bundle', async () => {
  const fan = await read('src/components/AIStoryReal3DFan.astro');
  assert.ok(fan.includes('data-fan-copy={JSON.stringify(fan)}'));
  assert.ok(fan.includes('fan.labels[view.id]'));
  const runtime = await read('src/lib/aistory-fan3d.js');
  assert.ok(runtime.includes('JSON.parse(root.dataset.fanCopy)'));
  assert.ok(!runtime.includes("from '../i18n"));
  for (const key of ['webglUnavailable','loadFailed','canvas','pause','resume','reduced','contextLost','centered','rotating'])
    assert.ok(runtime.includes('copy.'+key), 'Runtime localizes '+key);
});

test('language switch is link-based, accessible without JS, and only preserves section/query', async () => {
  const layout = await read('src/layouts/SiteLayout.astro');
  assert.ok(layout.includes('data-language-link={code}'));
  assert.ok(layout.includes('aria-current={locale === code'));
  assert.ok(layout.includes('url.hash = location.hash'));
  assert.ok(layout.includes('url.search = location.search'));
  assert.ok(!/location\.(?:assign|replace)\(|navigator\.language|localStorage/.test(layout));
  assert.ok(layout.includes('hreflang={value.lang}'));
  assert.ok(layout.includes('hreflang="x-default"'));
});

test('contact, sample-video notes, metadata and fallbacks are translated', () => {
  for (const locale of Object.keys(LOCALES)) {
    const t = getMessages(locale);
    for (const value of [t.contact.copied,t.contact.failed,t.demo.error,t.demo.unsupported,t.common.homeTitle,t.common.productDescription])
      assert.ok(locale === 'zh' ? /[\u4e00-\u9fff]/.test(value) : /[A-Za-z]/.test(value));
  }
});

test('sitemap uses the same four route definitions and robots points to it', async () => {
  const sitemap = await read('src/pages/sitemap.xml.js');
  assert.ok(sitemap.includes('Object.values(ROUTES)'));
  assert.ok((await read('public/robots.txt')).includes('Sitemap: https://leomonan.com/sitemap.xml'));
});
