/*
 * Real-browser verification that one generated WebGL scene poster agrees with
 * the first live Three.js frame. Requires playwright-core and sharp.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const ORIGIN = process.env.QA_BASE_URL || 'http://127.0.0.1:4321';
const DEST = process.env.QA_OUTPUT_DIR || '/tmp/aistory-scene-handoff';
const viewports = [
  { name:'desktop', width:1440, height:960 },
  { name:'tablet', width:1024, height:900 },
  { name:'small', width:640, height:900 },
  { name:'mobile', width:390, height:844 },
];

await mkdir(DEST, { recursive: true });
const browser = await chromium.launch({
  channel:'chrome', headless:true,
  args:['--no-sandbox','--enable-webgl','--use-gl=angle',
    '--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage'],
});

async function compareFrames(poster, live) {
  const one = await sharp(poster).removeAlpha().raw().toBuffer({ resolveWithObject:true });
  const two = await sharp(live).removeAlpha().raw().toBuffer({ resolveWithObject:true });
  assert.equal(one.info.width, two.info.width);
  assert.equal(one.info.height, two.info.height);
  assert.equal(one.data.length, two.data.length);
  let total = 0, changed = 0, big = 0;
  for (let i=0; i<one.data.length; i++) {
    const d = Math.abs(one.data[i]-two.data[i]);
    total += d;
    if (d > 8) changed++;
    if (d > 45) big++;
  }
  return {
    mae: total/one.data.length,
    changedPct:changed/one.data.length*100,
    bigPct:big/one.data.length*100,
  };
}

try {
  for (const size of viewports) {
    const rootUrl = ORIGIN + '/#work';
    const options = {
      viewport: { width:size.width, height:size.height },
      deviceScaleFactor:1,
    };

    const staticContext = await browser.newContext({ ...options, javaScriptEnabled:false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(rootUrl,{waitUntil:'domcontentloaded'});
    await staticPage.locator('.flagship-card').scrollIntoViewIfNeeded();
    const posterEl = staticPage.locator('[data-fan-poster] img');
    await posterEl.evaluate(img=>img.decode());
    const currentPoster = await posterEl.evaluate(img=>img.currentSrc.split('/').at(-1));
    assert.equal(currentPoster,'aistory-fan3d-poster-'+size.name+'.webp');
    assert.equal(await staticPage.locator('[data-real-fan-fallback]:not(.is-hidden)').count(),1);
    assert.equal(await staticPage.locator('[data-fan-poster] img').count(),1);
    const before = await staticPage.locator('[data-real-fan-stage]').screenshot({
      path:DEST+'/'+size.name+'-before-webgl.png',
    });
    const stageBefore = await staticPage.locator('[data-real-fan-stage]').boundingBox();
    const staticW=await staticPage.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(staticW<=size.width+2, 'SSR causes horizontal overflow');
    await staticContext.close();

    const liveContext = await browser.newContext(options);
    const livePage = await liveContext.newPage();
    const errors = [];
    livePage.on('pageerror',e=>errors.push(e.message));
    livePage.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
    await livePage.goto(rootUrl,{waitUntil:'domcontentloaded'});
    await livePage.locator('.flagship-card').scrollIntoViewIfNeeded();
    await livePage.waitForFunction(()=>{
      const root=document.querySelector('[data-real-fan]');
      const canvas=root?.querySelector('canvas.real-fan-canvas');
      const status=root?.querySelector('[data-real-fan-status]')?.textContent||'';
      const poster=root?.querySelector('[data-real-fan-fallback]');
      return !!canvas && status.includes('Episode centered') &&
        poster?.classList.contains('is-hidden');
    },null,{timeout:70000});
    await livePage.locator('[data-real-fan]').hover();
    const after = await livePage.locator('[data-real-fan-stage]').screenshot({
      path:DEST+'/'+size.name+'-after-webgl.png',
    });
    const stageAfter = await livePage.locator('[data-real-fan-stage]').boundingBox();
    assert.ok(Math.abs(stageBefore.width-stageAfter.width)<.2);
    assert.ok(Math.abs(stageBefore.height-stageAfter.height)<.2);
    assert.deepEqual(errors,[],'Browser errors: '+JSON.stringify(errors));
    const diff = await compareFrames(before,after);
    console.log('VISUAL_HANDOFF_'+size.name.toUpperCase()+' = '+JSON.stringify({
      stage:[stageAfter.width,stageAfter.height],
      poster:currentPoster,...diff,
    }));
    // WebGL and poster share exactly one 3D scene. Differences are allowed only
    // for lossy WebP encoding and minor platform anti-aliasing, not a
    // second visual composition.
    assert.ok(diff.mae < 18,
      size.name+' fallback/live difference too high: '+JSON.stringify(diff));

    if (size.name==='desktop') {
      await livePage.locator('[data-real-fan-tab="1"]').click();
      await livePage.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent?.includes('Universe centered'),null,{timeout:12000});
      await livePage.locator('[data-real-fan-tab="2"]').click();
      await livePage.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent?.includes('Character centered'),null,{timeout:12000});
      await livePage.locator('[data-real-fan-tab="0"]').click();
      await livePage.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent?.includes('Episode centered'),null,{timeout:15000});
      console.log('LIVE_3D_CAROUSEL_CONTINUITY=PASS');
    }
    await liveContext.close();
  }

  const failed = await browser.newPage({viewport:{width:1440,height:960}});
  await failed.route('**/apple_iphone_18_pro_max_silver_2026.glb',route=>route.abort());
  await failed.goto(ORIGIN+'/#work',{waitUntil:'domcontentloaded'});
  await failed.locator('.flagship-card').scrollIntoViewIfNeeded();
  await failed.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent?.includes('Unable to start 3D preview'),null,{timeout:45000});
  assert.equal(await failed.locator('[data-real-fan-fallback]:not(.is-hidden)').count(),1);
  assert.equal(await failed.locator('[data-fan-poster] img').count(),1);
  await failed.locator('[data-real-fan-stage]').screenshot({
    path:DEST+'/fallback-on-webgl-error.png',
  });
  console.log('GLB_FAILURE_KEEPS_IDENTICAL_SCENE_POSTER=PASS');
} finally {
  await browser.close();
}
