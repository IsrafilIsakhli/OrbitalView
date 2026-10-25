// Dev-only interaction regression; real native cache is read, never changed.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.ORBITAL_PLAYWRIGHT_MODULE).href);
const cache = process.env.ORBITAL_CATALOG_CACHE;
if (!cache) throw new Error('Real CelesTrak cache required');
const stage = process.argv[2] === 'before' ? 'before' : 'after';
const output = resolve(process.env.ORBITAL_SMOKE_OUTPUT ?? 'docs/screenshots/earth-zoom-stability');
await mkdir(output, { recursive: true });
const [orbital, recent, catalog, recentCatalog] = await Promise.all(['orbital.json','recent-orbital.json','catalog.json','recent-catalog.json'].map(async name => JSON.parse(await readFile(join(cache,name),'utf8'))));
const unique = records => [...new Map(records.map(record => [String(record.NORAD_CAT_ID),record])).values()];
const payload = { orbital:unique([...orbital.data,...recent.data]),catalog:unique([...catalog.data,...recentCatalog.data]),metadata:{catalogObjectCount:catalog.objectCount,expiresAt:new Date(orbital.expiresAtUnixMs).toISOString(),fetchedAt:new Date(orbital.fetchedAtUnixMs).toISOString(),source:'CelesTrak real local cache',stale:true} };
const report = {stage, environment:'Isolated Chromium, local NASA fallback; not native WebView or FPS acceptance',errors:[],cases:[]};
const browser = await chromium.launch({headless:true,executablePath:process.env.ORBITAL_CHROMIUM});
const watchdog = setTimeout(()=>void browser.close(),180000);
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/__earth_qa_catalog.json',route=>route.fulfill({json:payload}));
  await context.route(/https:\/\/.*arcgis.*/,route=>route.abort());
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:1426/tests/earth-visual.html?quality=high');
  await page.waitForFunction(()=>window.qa?.engine && window.qa.satelliteLayer()?.getSnapshot().status==='ready',null,{timeout:90000});
  await page.waitForTimeout(2000);
  report.count=await page.evaluate(()=>window.qa.catalog.satellites.length);
  const sample=async name=>{
    const state=await page.evaluate(()=>{
      const e=window.qa.engine,c=e.widget.camera,p=window.qa.project();
      return {height:c.positionCartographic.height,range:Math.hypot(c.position.x,c.position.y,c.position.z),worldRange:Math.hypot(c.positionWC.x,c.positionWC.y,c.positionWC.z),center:p?{x:p.x,y:p.y}:null,phase:e.getSnapshot().phase,follow:window.qa.satelliteLayer().getSnapshot().followSelected,frame:e.getSnapshot().presentedFrames};
    });
    report.cases.push({name,...state});
  };
  await sample('initial');
  await page.mouse.move(700,430);
  for(let i=0;i<16;i++){await page.mouse.wheel(0,1200);await page.waitForTimeout(65);}
  await page.waitForTimeout(700);await sample('far-out');
  await page.screenshot({path:join(output,`${stage}-far-out.png`)});
  for(let i=0;i<16;i++){await page.mouse.wheel(0,-1200);await page.waitForTimeout(65);}
  await page.waitForTimeout(700);await sample('zoom-back');
  await page.evaluate(()=>window.qa.engine.flyTo('earth'));await page.waitForTimeout(200);
  // An off-centre zoom must not pick a satellite or fling the globe off screen.
  await page.mouse.move(410,650);
  for(let i=0;i<8;i++){await page.mouse.wheel(0,-700);await page.waitForTimeout(100);}
  await page.waitForTimeout(500);await sample('near-surface');
  for(let i=0;i<8;i++){await page.mouse.wheel(0,700);await page.waitForTimeout(100);}
  await page.waitForTimeout(500);await sample('off-center-return');
  await page.evaluate(()=>window.qa.select('norad:25544'));await page.waitForTimeout(600);
  await page.evaluate(()=>window.qa.satelliteLayer().setFollowSelected(true));await page.waitForTimeout(200);
  await page.mouse.move(650,450);
  await sample('follow-start');
  for(let i=0;i<12;i++){await page.mouse.wheel(0,-700);await page.waitForTimeout(80);}
  await page.waitForTimeout(500);await sample('follow-near');
  report.trackedProjection=[];
  for(let i=0;i<16;i++) {
    await page.waitForTimeout(160);
    // Inspect a presented frame. A worker can publish the next position between
    // paints; projecting that raw position against the previous camera matrix
    // measures an unrendered intermediate state rather than visible drift.
    report.trackedProjection.push(await page.evaluate(()=>new Promise(resolve=>{
      const scene=window.qa.engine.widget.scene;
      const remove=scene.postRender.addEventListener(()=>{remove();resolve(window.qa.projectSelected());});
      scene.requestRender();
    })));
  }
  for(let i=0;i<12;i++){await page.mouse.wheel(0,700);await page.waitForTimeout(80);}
  await page.waitForTimeout(500);await sample('follow-far');
  await page.screenshot({path:join(output,`${stage}-follow.png`)});
  await page.keyboard.press('Escape');await page.waitForTimeout(300);await sample('closed');
  await page.evaluate(()=>{
    window.zoomAudit={frames:[],resizes:0};let prior;
    const e=window.qa.engine;
    e.widget.scene.postRender.addEventListener(()=>{const now=performance.now();if(prior)window.zoomAudit.frames.push(now-prior);prior=now;});
    const resize=e.widget.resize.bind(e.widget);let size='';
    e.widget.resize=()=>{resize();const next=`${e.widget.canvas.width}:${e.widget.canvas.height}`;if(next!==size){window.zoomAudit.resizes++;size=next;}};
  });
  await page.mouse.move(700,430);
  for(let i=0;i<30;i++){await page.mouse.wheel(0,i%2 ? 120 : -120);await page.waitForTimeout(220);}
  await page.waitForTimeout(600);
  report.interaction=await page.evaluate(()=>{const a=window.zoomAudit.frames.sort((a,b)=>a-b);return {resizes:window.zoomAudit.resizes,frames:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1)};});
  await sample('alternating');
  await page.screenshot({path:join(output,`${stage}-final.png`)});
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(550);await sample('button-in');
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();await page.waitForTimeout(550);await sample('button-out');
  await page.evaluate(()=>window.qa.engine.widget.canvas.focus());
  await page.keyboard.press('+');await page.waitForTimeout(550);await sample('keyboard-in');
  await page.keyboard.press('-');await page.waitForTimeout(550);await sample('keyboard-out');
  // The native right-drag path stays bounded too; selection remains ID-based.
  await page.mouse.move(700,400);await page.mouse.down({button:'right'});
  await page.mouse.move(700,750,{steps:12});await page.mouse.up({button:'right'});
  await page.waitForTimeout(600);await sample('right-drag');
  report.layouts=[];
  for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(200);
    await page.evaluate(()=>window.qa.engine.flyTo('earth'));await page.waitForTimeout(200);
    report.layouts.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));
    await page.screenshot({path:join(output,`${stage}-${width}.png`)});
  }
  await page.evaluate(()=>window.qa.unmount());
} finally {clearTimeout(watchdog);await browser.close();await writeFile(join(output,`${stage}.json`),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
if(stage==='after') {
  const height=name=>report.cases.find(c=>c.name===name).height;
  const points=report.trackedProjection;
  report.trackingSpreadPixels=Math.max(...points.map(p=>p?Math.hypot(p.x-points[0].x,p.y-points[0].y):Infinity));
  await writeFile(join(output,`${stage}.json`),JSON.stringify(report,null,2));
  if(report.errors.length || report.cases.some(c=>!Number.isFinite(c.height)||c.height<890||c.phase==='error') || height('far-out')>100_000_000 || report.interaction.resizes>6 || report.layouts.some(x=>x.overflow) || height('button-in')>=height('alternating') || height('button-out')<=height('button-in') || height('keyboard-in')>=height('button-out') || height('keyboard-out')<=height('keyboard-in') || report.trackingSpreadPixels>3)process.exitCode=1;
}
