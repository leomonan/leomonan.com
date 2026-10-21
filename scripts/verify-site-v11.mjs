/* Built-page regression; no dependency or rendering-geometry changes. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { FAN_AUTOPLAY_MS } from '../src/lib/aistory-fan3d-layout.js';
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:4321';
const out = process.env.V11_QA_OUT || '/tmp/site-v11';
const mode = process.env.QA_MODE || 'candidate';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={mode,layout:[],checks:[],errors:[]};
const selected = page => page.locator('[data-real-fan-tab][aria-selected="true"]').getAttribute('data-real-fan-tab');
const ready = page => page.waitForFunction(()=>document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),null,{timeout:90000});
const settled = (page,index) => page.waitForFunction(index=>{
  const root=document.querySelector('[data-real-fan]');
  return !root?.hasAttribute('data-turn-progress') && root?.querySelector('[data-real-fan-tab][aria-selected="true"]')?.getAttribute('data-real-fan-tab')===String(index);
},index,{timeout:20000});
const unhover = async page => {
  await page.mouse.move(0,0);
  await page.evaluate(()=>document.activeElement instanceof HTMLElement && document.activeElement.blur());
};
try {
  if(mode==='contact') {
    // A reserved test address is configured only in a temporary, local build.
    for(const path of ['/#about','/aistory#development']) for(const deny of [false,true]) {
      const context=await browser.newContext({viewport:{width:390,height:844}});
      const page=await context.newPage();
      await page.addInitScript(deny=>{
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
          if(deny) throw new DOMException('Denied','NotAllowedError');
          window.__copiedEmail=text;
        }}});
      },deny);
      await page.goto(base+path,{waitUntil:'domcontentloaded'});
      const root=page.locator('[data-public-contact]');await root.scrollIntoViewIfNeeded();
      assert.equal(await root.getAttribute('data-email'),'qa@example.test');
      assert.ok((await root.locator('a').getAttribute('href')).startsWith('mailto:qa@example.test?subject='));
      await root.locator('[data-copy-contact]').click();
      await page.waitForFunction(()=>!!document.querySelector('[data-copy-status]')?.textContent);
      const text=await root.locator('[data-copy-status]').textContent();
      assert.ok(deny ? text.includes('Copy is unavailable') : text==='Email address copied.');
      if(!deny) assert.equal(await page.evaluate(()=>window.__copiedEmail),'qa@example.test');
      report.checks.push(`${path} clipboard ${deny?'denied':'success'}`);
      await context.close();
    }
    const context=await browser.newContext({javaScriptEnabled:false});
    const page=await context.newPage();await page.goto(base+'/aistory');
    assert.equal(await page.locator('[data-public-contact] a').count(),1);
    assert.equal(await page.locator('[data-copy-contact]').isVisible(),false);
    report.checks.push('contact: mailto without JavaScript; no email sent');await context.close();
  } else {
    for(const width of [320,390,640,1024,1440]) {
      const context=await browser.newContext({javaScriptEnabled:false,viewport:{width,height:960}});
      const page=await context.newPage();await page.goto(base+'/',{waitUntil:'load'});
      const dimensions=await page.evaluate(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect();
        return {width:innerWidth,scroll:document.documentElement.scrollWidth,panelHeight:rect('.hero-panel').height,cardY:rect('.flagship-card').top+scrollY,stage:[rect('[data-real-fan-stage]').width,rect('[data-real-fan-stage]').height]};
      });
      assert.ok(dimensions.scroll<=width+1);
      report.layout.push(dimensions);
      if([390,640,1440].includes(width)) await page.locator('.hero').screenshot({path:`${out}/${mode}-home-${width}.png`});
      if(mode==='candidate') {
        assert.equal(await page.locator('.focus-row[href]').count(),3);
        for(const id of ['colook','easytranslator']) { await page.locator(`.focus-row[href="#${id}"]`).click(); assert.equal(new URL(page.url()).hash,'#'+id); }
        assert.equal(await page.locator('[data-real-fan-autoplay]').isVisible(),false);
        assert.equal(await page.locator('[data-public-contact]').count(),0,'Unapproved email must not be published');
      }
      await context.close();
    }
    if(mode==='candidate') {
      const before=JSON.parse(await readFile(out+'/baseline.json','utf8'));
      for(const after of report.layout) {
        const old=before.layout.find(x=>x.width===after.width);
        assert.deepEqual(after.stage,old.stage,'K stage dimensions must not change');
        if(after.width<=640) {
          assert.ok(after.panelHeight<old.panelHeight-100,'Compact directory removes decorative height');
          assert.ok(after.cardY<old.cardY-100,'Product appears earlier');
        } else assert.ok(Math.abs(after.cardY-old.cardY)<2,'Desktop hero layout must not drift');
      }
      report.checks.push('three directory destinations; smaller mobile hero; identical K stage sizes');
      for(const path of ['/','/aistory']) for(const width of [1440,390]) {
        const context=await browser.newContext({viewport:{width,height:960}});
        const page=await context.newPage();
        page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(base+path,{waitUntil:'domcontentloaded'});
        await page.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();await ready(page);
        const button=page.locator('[data-real-fan-autoplay]');
        assert.equal(await button.textContent(),'Pause autoplay');
        // Pause in the middle of an actual rendered transition; do not freeze it.
        await page.locator('[data-real-fan-tab="1"]').click();
        await page.waitForFunction(()=>{
          const p=Number(document.querySelector('[data-real-fan]')?.getAttribute('data-turn-progress')||0);
          return p>.05 && p<.9;
        });
        await button.evaluate(b=>b.click());
        await settled(page,1);assert.equal(await button.textContent(),'Resume autoplay');
        await page.locator('[data-real-fan-tab="2"]').click();await settled(page,2);
        // Side picking and swiping remain available while explicitly paused.
        const r=await page.locator('canvas.real-fan-canvas').boundingBox();
        await page.mouse.click(r.x+r.width*.2,r.y+r.height*.5);await settled(page,1);
        await page.locator('canvas.real-fan-canvas').evaluate(el=>{
          const box=el.getBoundingClientRect(),x=box.x+box.width*.75,y=box.y+box.height*.55;
          el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,pointerType:'touch',clientX:x,clientY:y,bubbles:true}));
          el.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,pointerType:'touch',clientX:x-100,clientY:y,bubbles:true}));
        });await settled(page,2);
        await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(180);
        await page.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
        await page.setViewportSize({width:width+8,height:960});await page.waitForTimeout(180);
        // Exercise the document-visibility handler without relying on headless tab focus.
        await page.evaluate(()=>{
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
          delete document.hidden;
        });
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForFunction(()=>matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('[data-real-fan-autoplay]').disabled);
        assert.equal(await button.isDisabled(),true);
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.waitForFunction(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches && !document.querySelector('[data-real-fan-autoplay]').disabled && document.querySelector('[data-real-fan-autoplay]').textContent==='Resume autoplay');
        assert.equal(await button.textContent(),'Resume autoplay');
        await unhover(page);
        await page.waitForTimeout(FAN_AUTOPLAY_MS*2+1000);
        assert.equal(await selected(page),'2','Explicit pause survives two real timer periods');
        await page.locator('[data-real-fan]').screenshot({path:`${out}/paused-${path==='/'?'home':'product'}-${width}.png`});
        await button.focus();await page.keyboard.press('Enter');await unhover(page);
        await page.waitForFunction(()=>document.querySelector('[data-real-fan-tab][aria-selected="true"]')?.getAttribute('data-real-fan-tab')!=='2',null,{timeout:12000});
        await button.click();await page.waitForTimeout(1100);
        await page.goto(base+(path==='/'?'/aistory':'/'),{waitUntil:'domcontentloaded'});
        await page.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();await ready(page);
        assert.equal(await page.locator('[data-real-fan-autoplay]').textContent(),'Resume autoplay','Navigation preserves session preference');
        report.checks.push(`${path} ${width}px: finish move; tabs; side pick; swipe; scroll; resize; visibility event; 2 timers; keyboard resume; navigation`);
        await context.close();
      }
      const blocked=await browser.newContext();const p=await blocked.newPage();
      await p.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage denied');};Storage.prototype.setItem=()=>{throw new Error('Storage denied');};});
      await p.goto(base+'/aistory');await p.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();await ready(p);
      await p.locator('[data-real-fan-autoplay]').click();assert.equal(await p.locator('[data-real-fan-autoplay]').textContent(),'Resume autoplay');
      await p.locator('canvas').evaluate(el=>el.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
      assert.equal(await p.locator('[data-real-fan-autoplay]').isDisabled(),true);
      assert.equal(await p.locator('[data-real-fan-fallback]:not(.is-hidden)').count(),1);
      report.checks.push('storage denied: local pause works; context-loss handler disables control');await blocked.close();
      const fail=await browser.newPage();await fail.route('**/*.glb',r=>r.abort());
      await fail.goto(base+'/aistory');await fail.locator('[data-real-fan-stage]').scrollIntoViewIfNeeded();
      await fail.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent.includes('Unable to start 3D preview'),null,{timeout:90000});
      assert.equal(await fail.locator('[data-real-fan-autoplay]').isVisible(),false);
      report.checks.push('model failure: no dead autoplay button');await fail.close();
      assert.deepEqual(report.errors,[]);
    }
  }
  report.status='PASS';
  await writeFile(`${out}/${mode}.json`,JSON.stringify(report,null,2));
  console.log('SITE_V11_'+mode+'='+JSON.stringify(report));
} finally {await browser.close();}
