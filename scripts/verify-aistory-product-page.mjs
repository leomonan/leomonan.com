/* Real built pages, not a fixture. Requires ephemeral playwright-core. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const base=process.env.QA_BASE_URL||'http://127.0.0.1:4321';
const out=process.env.PRODUCT_QA_OUT||'/tmp/aistory-product-page';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const evidence={viewports:[],browserErrors:[],checks:[]};
try {
  for(const width of [320,390,640,1024,1440,1920]){
    const context=await browser.newContext({viewport:{width,height:960},deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(e.type()==='error') errors.push(e.text());});
    const response=await page.goto(base+'/aistory',{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200);
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://leomonan.com/aistory');
    assert.ok((await page.title()).startsWith('AIStory'));
    await page.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),null,{timeout:80000});
    assert.equal(await page.locator('canvas.real-fan-canvas').count(),1);
    await page.locator('.workflow-grid').scrollIntoViewIfNeeded();
    await page.locator('.workflow-grid img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    const images=await page.locator('.workflow-grid img').evaluateAll(images=>images.map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight})));
    assert.equal(images.length,4);
    assert.ok(images.every(i=>i.w===1122&&i.h===1402));
    const brokenAnchors=await page.locator('a[href^="#"]').evaluateAll(links=>links.map(a=>a.hash).filter(hash=>!document.getElementById(hash.slice(1))));
    assert.deepEqual(brokenAnchors,[]);
    const measure=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,stage:document.querySelector('[data-real-fan-stage]').getBoundingClientRect().toJSON()}));
    assert.ok(measure.scrollWidth<=width+1,`Overflow at ${width}: ${measure.scrollWidth}`);
    await page.screenshot({path:`${out}/aistory-${width}-full.png`,fullPage:true});
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${out}/aistory-${width}-hero.png`});
    assert.deepEqual(errors,[]);
    evidence.viewports.push({width,scrollWidth:measure.scrollWidth,stage:[measure.stage.width,measure.stage.height],images:images.length});
    await context.close();
  }

  // Keyboard navigation into the page, refresh, internal links, full-size image, return.
  const ctx=await browser.newContext({viewport:{width:1440,height:960}});
  const page=await ctx.newPage();
  await page.goto(base+'/#work',{waitUntil:'domcontentloaded'});
  const entry=page.locator('[data-aistory-entry]');
  await entry.scrollIntoViewIfNeeded();
  await page.locator('[data-real-fan-stage]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),null,{timeout:80000});
  await page.locator('[data-real-fan]').hover();
  await page.locator('.flagship-card').screenshot({path:out+'/homepage-aistory-entry.png'});
  await entry.focus();await page.keyboard.press('Enter');
  await page.waitForURL(/\/aistory\/?$/);
  assert.equal((await page.reload({waitUntil:'domcontentloaded'})).status(),200);
  await page.locator('.product-actions a[href="#workflow"]').click();
  assert.equal(new URL(page.url()).hash,'#workflow');
  const imageLink=page.locator('.screen-link').first();
  const [popup]=await Promise.all([ctx.waitForEvent('page'),imageLink.click()]);
  await popup.waitForLoadState('load');assert.ok(popup.url().endsWith('/images/work/aistory-create.webp'));await popup.close();
  await page.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),null,{timeout:80000});
  await page.locator('[data-real-fan]').hover();
  for(const [index,label] of [[1,'Universe'],[2,'Character'],[3,'Create'],[0,'Episode']]){
    await page.locator(`[data-real-fan-tab="${index}"]`).click();
    await page.waitForFunction(label=>document.querySelector('[data-real-fan-status]')?.textContent.includes(label+' centered'),label,{timeout:20000});
  }
  await page.locator('.back-link').click();await page.waitForURL(/\/#work$/);
  evidence.checks.push('home keyboard entry','direct reload','workflow anchor','original image opens','four product-page carousel states','return to homepage');
  await ctx.close();

  const ssr=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const staticPage=await ssr.newPage();await staticPage.goto(base+'/aistory',{waitUntil:'load'});
  assert.equal(await staticPage.locator('h1').count(),1);
  assert.equal(await staticPage.locator('[data-real-fan-fallback]:not(.is-hidden)').count(),1);
  assert.equal(await staticPage.locator('.workflow-step').count(),4);
  assert.equal(await staticPage.locator('canvas').count(),0);
  evidence.checks.push('no JavaScript: content, links, and poster');await ssr.close();

  const failed=await browser.newPage({viewport:{width:390,height:844}});
  await failed.route('**/apple_iphone_18_pro_max_silver_2026.glb',r=>r.abort());
  await failed.goto(base+'/aistory',{waitUntil:'domcontentloaded'});
  await failed.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
  await failed.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent.includes('Unable to start 3D preview'),null,{timeout:60000});
  assert.equal(await failed.locator('[data-real-fan-fallback]:not(.is-hidden)').count(),1);
  evidence.checks.push('GLB failure: poster retained');await failed.close();

  const reduced=await browser.newPage({reducedMotion:'reduce',viewport:{width:1440,height:960}});
  await reduced.goto(base+'/aistory',{waitUntil:'domcontentloaded'});
  await reduced.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
  await reduced.waitForFunction(()=>document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),null,{timeout:80000});
  await reduced.waitForTimeout(5500);
  assert.ok((await reduced.locator('[data-real-fan-status]').textContent()).includes('Episode centered'));
  evidence.checks.push('reduced motion: no autoplay');await reduced.close();
  evidence.status='PASS';
  await writeFile(out+'/verification.json',JSON.stringify(evidence,null,2));
  console.log('AISTORY_PRODUCT_PAGE='+JSON.stringify(evidence));
} finally {await browser.close();}
