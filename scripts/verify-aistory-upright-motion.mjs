/*
 * Repeatable Chrome/WebGL regression for K's visible upright entry/exit.
 * Test-only inspection is removed from source in finally, never shipped.
 * Requires playwright-core installed temporarily (not a runtime dependency).
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const source = 'src/lib/aistory-fan3d.js';
const original = await readFile(source,'utf8');
const anchor = '  function renderFrame(timestamp) {';
const drawAnchor = '    renderer.render(scene, camera);';
const dest = process.env.K_MOTION_QA_OUT || '/tmp/aistory-upright-motion';
await mkdir(dest,{recursive:true});
let browser,server;

const hook = [
  '  if (window.__FAN_E2E__) {',
  '    window.__fanMotionProbe = () => ({',
  '      active, desired, progress: Number(root.dataset.turnProgress || 0),',
  '      routes: animation?.motions.map(route => {',
  '        const phone = phones[route.index];',
  "        const e = new THREE.Euler().setFromQuaternion(phone.root.quaternion, 'YXZ');",
  '        return { index:route.index, from:route.fromSlot, to:route.toSlot,',
  '          kind:route.uprightPhase, crossing:route.crossing,',
  '          yaw:e.y/DEG, roll:e.z/DEG, visible:phone.root.visible,',
  '          texture: textures[route.index].uuid };',
  '      }) || []',
  '    });',
  '  }',
].join('\n')+'\n';
const capture = [
  drawAnchor,
  '    if (window.__FAN_E2E__ && window.__motionFrames && animation) {',
  '      window.__motionFrames.push(window.__fanMotionProbe());',
  '    }',
].join('\n');

try {
  assert.equal(original.split(anchor).length,2,'Unique test hook position');
  assert.equal(original.split(drawAnchor).length,2,'Unique render observation point');
  // Observe completed real renders, not a 12ms timer that can miss frames or
  // repeatedly sample the same pose while the browser is busy with WebGL.
  await writeFile(source,original.replace(anchor,hook+anchor).replace(drawAnchor,capture));
  execFileSync('npm',['run','build'],{stdio:'inherit'});
  server=spawn(process.execPath,['node_modules/astro/bin/astro.mjs',
    'preview','--host','127.0.0.1','--port','4332'],{stdio:'inherit'});
  let ready=false;
  for(let i=0;i<80;i++){
    try { if((await fetch('http://127.0.0.1:4332/')).ok){ready=true;break;} } catch {}
    await new Promise(done=>setTimeout(done,300));
  }
  assert.ok(ready,'Astro real page must start');
  browser=await chromium.launch({
    channel:'chrome',headless:true,
    args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader','--disable-dev-shm-usage']
  });
  let verified=0;
  for(const view of [{name:'desktop',width:1440,height:960},{name:'mobile',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:view.width,height:view.height}});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    await page.addInitScript(()=>{window.__FAN_E2E__=true;});
    await page.goto('http://127.0.0.1:4332/#work',{waitUntil:'domcontentloaded'});
    await page.locator('.flagship-card').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>window.__fanMotionProbe &&
      document.querySelector('[data-real-fan-fallback]')?.classList.contains('is-hidden'),
      null,{timeout:80000});
    await page.locator('[data-real-fan]').hover();

    // Forward and backward movements both tested across two widths.
    for(const [step,selected] of [1,0,3,0].entries()){
      await page.evaluate(index=>{
        window.__motionFrames=[];
        document.querySelector('[data-real-fan-tab="'+index+'"]').click();
        window.__motionFrames.push(window.__fanMotionProbe());
      },selected);
      await page.waitForFunction(index=>{
        const labels=['Episode','Universe','Character','Create'];
        const text=document.querySelector('[data-real-fan-status]')?.textContent||'';
        return text.includes(labels[index]+' centered') &&
          window.__fanMotionProbe().active===index;
      },selected,{timeout:25000});
      const snaps=await page.evaluate(()=>{
        const frames=window.__motionFrames;
        window.__motionFrames=null;
        return frames;
      });
      await writeFile(`${dest}/${view.name}-step-${step}-${selected}.json`,JSON.stringify(snaps,null,2));
      const motion=snaps.filter(s=>s.routes.length);
      assert.ok(motion.length>=3,'Must sample real rendered rotation frames');
      const entries=motion.map(s=>({...s,route:s.routes.find(r=>r.kind==='enter')}));
      const exits=motion.map(s=>({...s,route:s.routes.find(r=>r.kind==='exit')}));
      const startIn=entries[0].route,startOut=exits[0].route;
      assert.ok(startIn && startOut);
      assert.ok(startIn.crossing>.01 && startIn.crossing<.99);
      assert.ok(startOut.crossing>.01 && startOut.crossing<.99);
      assert.ok(Math.abs(startIn.yaw)<.002 && Math.abs(startIn.roll)<.002,
        'Incoming phone begins offstage upright');
      const sign=startOut.from==='left'?1:-1;
      assert.ok(Math.abs(startOut.yaw - sign*38.171875)<.002,
        'Outgoing phone begins at unchanged K yaw');
      assert.ok(Math.abs(startOut.roll - sign*12.0625)<.002,
        'Outgoing phone begins at unchanged K roll');
      let entryVisibleRotation=false,exitVisibleRotation=false;
      let priorEntry=0,priorExit=1;
      for(let i=0;i<motion.length;i++){
        const a=entries[i],b=exits[i];
        const e=Math.abs(a.route.yaw)/38.171875;
        const x=Math.abs(b.route.yaw)/38.171875;
        assert.ok(e>=-.002 && e<=1.002 && e>=priorEntry-.025,
          'Entry K tilt progresses without reversal or overshoot');
        assert.ok(x>=-.002 && x<=1.002 && x<=priorExit+.025,
          'Exit K tilt unwinds without reversal or overshoot');
        priorEntry=e;priorExit=x;
        if(a.progress<a.route.crossing-.005)
          assert.ok(e<.005,'Phone is upright until appearing');
        if(b.progress>b.route.crossing+.005)
          assert.ok(x<.005,'Phone has become upright by disappearing');
        if(a.progress>a.route.crossing+.02 && a.progress<.95 && e>.01)
          entryVisibleRotation=true;
        if(b.progress<b.route.crossing-.02 && b.progress>.04 && x<.99)
          exitVisibleRotation=true;
        for(const r of motion[i].routes) {
          assert.equal(r.visible,true,'No popping/visibility toggle midstep');
          const match=motion[0].routes.find(y=>y.index===r.index);
          assert.equal(r.texture,match.texture,'No screenshot replacement midstep');
        }
      }
      console.log('K_RENDER_SAMPLES='+JSON.stringify({view:view.name,step,selected,
        samples:motion.map(s=>({t:s.progress,exitYaw:s.routes.find(r=>r.kind==='exit').yaw}))}));
      assert.ok(entryVisibleRotation,'Rotate toward K within visible entry travel');
      assert.ok(exitVisibleRotation,'Unwind K within visible exit travel');
      console.log('K_UPRIGHT_'+view.name+'_'+selected+'=PASS '+JSON.stringify({
        entryCrossing:startIn.crossing,exitCrossing:startOut.crossing,frames:motion.length}));
      verified++;
    }
    assert.deepEqual(errors,[],'No WebGL/runtime errors in '+view.name);
    const width=await page.evaluate(()=>({
      document:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.ok(width.document<=width.viewport+2,'No horizontal overflow');
    await page.locator('[data-real-fan-stage]').screenshot({
      path:dest+'/'+view.name+'-settled-K.png'
    });
    await context.close();
  }
  console.log('K_UPRIGHT_MOTION_ACCEPTANCE='+JSON.stringify({
    status:'PASS',steps:verified,viewports:2,directions:'both',
    entry:'upright into K inside viewport',exit:'K into upright before leaving',
    browserErrors:0
  }));
} finally {
  if(browser)await browser.close();
  if(server)server.kill('SIGTERM');
  await writeFile(source,original);
}
