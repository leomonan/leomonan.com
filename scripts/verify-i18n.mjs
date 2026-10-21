/* Four real static routes, both languages, no download of the test recording. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {getMessages,LOCALES,ROUTES,localizedPath,SITE_URL} from '../src/i18n/index.js';
import {PUBLIC_CONTACT_EMAIL} from '../src/lib/site-contact.js';
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4321';
const out=process.env.I18N_QA_OUT||'/tmp/site-i18n-evidence';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chrome'}),
  headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={static:[],live:[],checks:[],pageErrors:[],videoRequests:0};
async function preventMedia(context) {
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(/\.(mov|mp4)(?:$|\?)/i.test(url.href)) { report.videoRequests++;return route.abort(); }
    if(url.origin!==new URL(base).origin) return route.abort();
    return route.continue();
  });
}
const ready=p=>p.waitForFunction(()=>document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),null,{timeout:90000});
const settle=(p,i)=>p.waitForFunction(i=>{
  const root=document.querySelector('[data-real-fan]');
  return !root?.hasAttribute('data-turn-progress') && root?.querySelector('[aria-selected="true"]')?.getAttribute('data-real-fan-tab')===String(i);
},i,{timeout:20000});
try {
  for(const locale of Object.keys(LOCALES)) for(const pageName of ['home','aistory']) {
    const route=localizedPath(locale,pageName),copy=getMessages(locale);
    for(const width of [320,390,640,1024,1440,1920]) {
      const context=await browser.newContext({javaScriptEnabled:false,viewport:{width,height:960}});
      await preventMedia(context);
      const p=await context.newPage();
      assert.equal((await p.goto(base+route,{waitUntil:'load'})).status(),200);
      await p.evaluate(()=>document.fonts.ready);
      assert.equal(await p.locator('html').getAttribute('lang'),LOCALES[locale].lang);
      assert.equal(await p.title(),pageName==='home'?copy.common.homeTitle:copy.common.productTitle);
      assert.equal(await p.locator('h1').count(),1);
      if(locale==='zh') {
        const typography=await p.locator('h1').evaluate(h=>({
          heading:getComputedStyle(h).fontFamily,
          accent:getComputedStyle(h.querySelector('em')).fontFamily,
          style:getComputedStyle(h.querySelector('em')).fontStyle,
        }));
        assert.equal(typography.accent,typography.heading,'Chinese accent must not fall back to a Latin serif');
        assert.equal(typography.style,'normal');
      }
      assert.equal(await p.locator('link[rel="canonical"]').getAttribute('href'),SITE_URL+route);
      assert.equal(await p.locator('link[rel="alternate"][hreflang]').count(),3);
      for(const lang of Object.keys(LOCALES)) {
        assert.equal(await p.locator(`link[hreflang="${LOCALES[lang].lang}"]`).getAttribute('href'),SITE_URL+localizedPath(lang,pageName));
        assert.equal(await p.locator(`[data-language-link="${lang}"]`).getAttribute('href'),localizedPath(lang,pageName));
      }
      assert.equal(await p.locator('.language-switch [aria-current="page"]').getAttribute('data-language-link'),locale);
      assert.equal(await p.locator('[data-public-contact]').getAttribute('data-email'),PUBLIC_CONTACT_EMAIL);
      assert.equal((await p.locator('[data-public-contact] a').textContent()).includes(copy.contact.email),true);
      assert.deepEqual(await p.locator('.fan-tab strong').allTextContents(),Object.values(copy.fan.labels));
      const bad=await p.locator('a[href^="#"]').evaluateAll(links=>links.map(l=>l.hash).filter(hash=>!document.getElementById(decodeURIComponent(hash.slice(1)))));
      assert.deepEqual(bad,[],'No broken section links');
      const layout=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
        stage:((b)=>[b.width,b.height])(document.querySelector('[data-real-fan-stage]').getBoundingClientRect())}));
      assert.ok(layout.scroll<=width+1,`${locale} ${pageName} ${width} overflows: ${layout.scroll}`);
      if(pageName==='home') {
        assert.equal(await p.locator('[data-aistory-entry]').getAttribute('href'),localizedPath(locale,'aistory'));
        const v=p.locator('[data-aistory-demo-video]');
        assert.equal(await v.getAttribute('preload'),'none');
        const bounds=await v.boundingBox();assert.ok(bounds.height>bounds.width);
        assert.ok((await p.locator('#aistory-demo-title').textContent()).includes(copy.demo.title));
      } else {
        assert.equal(await p.locator('.back-link').getAttribute('href'),localizedPath(locale,'home')+'#work');
        assert.deepEqual(await p.locator('.workflow-grid img').evaluateAll(img=>img.map(i=>i.alt)),copy.product.steps.map(i=>i.alt));
      }
      if([390,1440].includes(width)) {
        await p.screenshot({path:`${out}/${locale}-${pageName}-${width}-hero.png`});
        await p.screenshot({path:`${out}/${locale}-${pageName}-${width}-full.png`,fullPage:true});
      }
      report.static.push({locale,page:pageName,...layout});
      await context.close();
    }
  }
  for(const locale of Object.keys(LOCALES)) for(const pageName of ['home','aistory']) for(const width of [390,1440]) {
    const copy=getMessages(locale),route=localizedPath(locale,pageName);
    const context=await browser.newContext({viewport:{width,height:960}});
    await preventMedia(context);
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    const p=await context.newPage();p.on('pageerror',e=>report.pageErrors.push(e.message));
    await p.goto(base+route,{waitUntil:'domcontentloaded'});
    await p.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();await ready(p);
    const button=p.locator('[data-real-fan-autoplay]');
    assert.equal(await button.textContent(),copy.fan.pause);
    await button.click();assert.equal(await button.textContent(),copy.fan.resume);
    await p.locator('[data-real-fan-tab="1"]').click();await settle(p,1);
    assert.ok((await p.locator('[data-real-fan-status]').textContent()).includes(copy.fan.labels.universe));
    assert.equal(await p.locator('canvas.real-fan-canvas').getAttribute('aria-label'),copy.fan.canvas);
    await p.locator('.flagship-card').screenshot({path:`${out}/${locale}-${pageName}-${width}-live-K.png`});
    await p.locator('[data-public-contact]').scrollIntoViewIfNeeded();
    await p.locator('[data-copy-contact]').click();
    await p.waitForFunction(expected=>document.querySelector('[data-copy-status]')?.textContent===expected,copy.contact.copied);
    assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),PUBLIC_CONTACT_EMAIL);
    await p.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied');}}}));
    await p.locator('[data-copy-contact]').click();
    await p.waitForFunction(expected=>document.querySelector('[data-copy-status]')?.textContent===expected,copy.contact.failed);
    // Switch at a real shared section, using a keyboard-accessible normal link.
    const hash=pageName==='home'?'#work':'#workflow';
    await p.evaluate(hash=>{history.replaceState(null,'',location.pathname+'?source=language-check'+hash);window.dispatchEvent(new HashChangeEvent('hashchange'));},hash);
    const other=locale==='en'?'zh':'en';
    const link=p.locator(`[data-language-link="${other}"]`);
    await p.waitForFunction(({other,hash})=>document.querySelector(`[data-language-link="${other}"]`)?.getAttribute('href')?.endsWith('?source=language-check'+hash),{other,hash});
    await link.focus();await p.keyboard.press('Enter');
    await p.waitForURL(url=>url.pathname===localizedPath(other,pageName)&&url.hash===hash);
    assert.equal(new URL(p.url()).search,'?source=language-check');
    assert.equal(await p.locator('html').getAttribute('lang'),LOCALES[other].lang);
    await p.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();await ready(p);
    assert.equal(await p.locator('[data-real-fan-autoplay]').textContent(),getMessages(other).fan.resume,'Pause intent survives language switch');
    assert.equal((await p.reload({waitUntil:'domcontentloaded'})).status(),200);
    assert.equal(await p.locator('html').getAttribute('lang'),LOCALES[other].lang);
    report.live.push({locale,page:pageName,width,copy:true,pause:true,languageSwitch:true,reload:true});
    await context.close();
  }
  for(const locale of Object.keys(LOCALES)) {
    const copy=getMessages(locale);
    const c=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});await preventMedia(c);
    const p=await c.newPage();await p.goto(base+localizedPath(locale,'aistory'));
    await p.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();await ready(p);
    assert.equal(await p.locator('[data-real-fan-autoplay]').textContent(),copy.fan.reduced);
    assert.equal(await p.locator('[data-real-fan-autoplay]').isDisabled(),true);await c.close();
    const fail=await browser.newContext();await preventMedia(fail);
    await fail.route('**/*.glb',r=>r.abort());
    const f=await fail.newPage();await f.goto(base+localizedPath(locale,'home'));
    await f.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
    await f.waitForFunction(text=>document.querySelector('[data-real-fan-status]')?.textContent===text,copy.fan.loadFailed,{timeout:90000});
    assert.equal(await f.locator('[data-real-fan-fallback]').isVisible(),true);
    await f.locator('[data-aistory-demo-video]').dispatchEvent('error');
    assert.equal((await f.locator('[data-demo-error]').textContent()).trim(),copy.demo.error);
    await fail.close();
    report.checks.push(locale+': reduced motion, GLB error, video error translated');
  }
  const sitemap=await (await fetch(base+'/sitemap.xml')).text();
  for(const routes of Object.values(ROUTES)) for(const route of Object.values(routes)) assert.ok(sitemap.includes('<loc>'+SITE_URL+route+'</loc>'));
  assert.ok((await (await fetch(base+'/robots.txt')).text()).includes('/sitemap.xml'));
  assert.deepEqual(report.pageErrors,[]);assert.equal(report.videoRequests,0);
  report.status='PASS';
  await writeFile(out+'/verification.json',JSON.stringify(report,null,2));
  console.log('I18N_ACCEPTANCE=PASS '+JSON.stringify({staticCases:report.static.length,liveCases:report.live.length,checks:report.checks,videoRequests:report.videoRequests,errors:report.pageErrors}));
} finally { await browser.close(); }
