import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const label=process.env.QA_LABEL||'candidate';
const url=process.env.QA_URL||'http://127.0.0.1:4321/';
const output=process.env.QA_DIR||'/tmp/aistory-crispness-study';
const sizes=[
 {id:'desktop-1x',width:1440,height:960,dpr:1},
 {id:'desktop-2x',width:1440,height:960,dpr:2},
 {id:'mobile-3x',width:390,height:844,dpr:3},
];
await mkdir(output,{recursive:true});
const browser=await chromium.launch({
 channel:'chrome',headless:true,
 args:['--no-sandbox','--enable-webgl','--use-gl=angle',
 '--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']
});
const records=[];
try {
 for(const size of sizes){
  const ctx=await browser.newContext({
   viewport:{width:size.width,height:size.height},
   deviceScaleFactor:size.dpr,
  });
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'#work',{waitUntil:'domcontentloaded'});
  await page.locator('.flagship-card').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
   const host=document.querySelector('[data-real-fan]');
   return !!host?.querySelector('.real-fan-canvas') &&
       host.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden');
  },null,{timeout:90000});
  await page.locator('[data-real-fan]').hover();
  // Capture Universe as center, matching the customer's screenshot.
  await page.locator('[data-real-fan-tab="1"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-real-fan-status]')?.textContent?.includes('Universe centered'),null,{timeout:20000});
  await page.waitForTimeout(180);
  const canvas=await page.locator('canvas.real-fan-canvas').evaluate(el=>({
   width:el.width,height:el.height,cssW:el.clientWidth,cssH:el.clientHeight,
   dpr:window.devicePixelRatio
  }));
  const pic=await page.locator('[data-real-fan-stage]').screenshot({path:output+'/'+label+'-'+size.id+'-universe.png'});
  const ratios={x:canvas.width/canvas.cssW,y:canvas.height/canvas.cssH};
  assert.deepEqual(errors,[]);
  assert.ok(Math.abs(ratios.x-ratios.y)<.02);
  records.push({label,viewport:size.id,canvas,ratios,screenshotBytes:pic.length});
  await ctx.close();
 }
 await writeFile(output+'/'+label+'-metrics.json',JSON.stringify(records,null,2));
 console.log('CRISPNESS_CAPTURE_'+label+'='+JSON.stringify(records));
} finally { await browser.close(); }
