import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUBLIC_CONTACT_EMAIL, contactDetails } from '../src/lib/site-contact.js';
const read = path => readFile(new URL('../'+path, import.meta.url), 'utf8');

test('contact is opt-in and never falls back to an account or commit address', () => {
  assert.equal(contactDetails(''),null);
  assert.equal(contactDetails('  '),null);
  assert.ok(PUBLIC_CONTACT_EMAIL === '' || contactDetails(PUBLIC_CONTACT_EMAIL));
});
test('contact URI safely encodes its subject and rejects unsafe address input', () => {
  const contact = contactDetails(' qa@example.test ', 'AIStory — Feedback / Preview interest');
  assert.equal(contact.email,'qa@example.test');
  assert.equal(contact.href,'mailto:qa@example.test?subject=AIStory%20%E2%80%94%20Feedback%20%2F%20Preview%20interest');
  for (const invalid of ['qa@example.test\r\nBcc:someone@example.test','qa@example.test?bcc=x','not-an-address','https://example.test'])
    assert.throws(()=>contactDetails(invalid), TypeError);
});
test('product directory exposes three links and valid destinations', async () => {
  const home = await read('src/pages/index.astro');
  assert.equal((home.match(/class="focus-row focus-link"/g)||[]).length,3);
  for (const id of ['colook','easytranslator']) {
    assert.ok(home.includes(`href="#${id}"`));
    assert.ok(home.includes(`id="${id}"`));
  }
  assert.ok(!home.includes('.hero-panel { min-height: 410px'));
  assert.ok(!home.includes('.hero-panel { min-height: 460px'));
});
test('pause is a native action and leaves the animation geometry alone', async () => {
  const component = await read('src/components/AIStoryReal3DFan.astro');
  assert.match(component,/<button[^>]+type="button"[^>]+data-real-fan-autoplay hidden>/);
  const runtime = await read('src/lib/aistory-fan3d.js');
  assert.match(runtime,/disposed \|\| animation \|\| userPaused \|\| contextLost \|\| motion.matches/);
  const handler=runtime.slice(runtime.indexOf("add(autoplayButton, 'click'"),runtime.indexOf('  tabs.forEach((tab, index)'));
  assert.ok(handler.includes('userPaused = !userPaused'));
  assert.ok(!/cancelAnimationFrame|applyPose|placeInstant|quaternion/.test(handler));
});
test('pause remains explicit through visibility, reduced motion and context loss', async () => {
  const runtime = await read('src/lib/aistory-fan3d.js');
  assert.equal((runtime.match(/userPaused = !userPaused/g)||[]).length,1);
  assert.match(runtime,/try \{ userPaused = sessionStorage.getItem/);
  assert.match(runtime,/autoplayButton.disabled = motion.matches \|\| contextLost/);
  assert.match(runtime,/contextLost = true;\n    syncAutoplayControl/);
});
test('both pages use the gated contact actions; copies report success only after writing', async () => {
  for (const path of ['src/pages/index.astro','src/pages/aistory.astro']) {
    assert.ok((await read(path)).includes('<ContactActions'));
  }
  const component = await read('src/components/ContactActions.astro');
  assert.ok(component.includes('{contact && ('));
  assert.ok(component.indexOf('await navigator.clipboard.writeText') < component.indexOf("status.textContent = 'Email address copied.'"));
  assert.ok(component.includes('Copy is unavailable. Select and copy the address above.'));
});
