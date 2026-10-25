import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.ORBITAL_PLAYWRIGHT_MODULE).href);
const cache=process.env.ORBITAL_CATALOG_CACHE;
const [orbital,recent,catalog,recentCatalog]=await Promise.all(['orbital.json','recent-orbital.json','catalog.json','recent-catalog.json'].map(async name=>JSON.parse(await readFile(join(cache,name),'utf8'))));
const unique=records=>[...new Map(records.map(record=>[String(record.NORAD_CAT_ID),record])).values()];
const payload={orbital:unique([...orbital.data,...recent.data]),catalog:unique([...catalog.data,...recentCatalog.data]),metadata:{catalogObjectCount:catalog.objectCount,expiresAt:new Date(orbital.expiresAtUnixMs).toISOString(),fetchedAt:new Date(orbital.fetchedAtUnixMs).toISOString(),source:'CelesTrak real local cache',stale:true}};
const stage=process.argv[2]==='after'?'after':'before';
const output=resolve(process.env.ORBITAL_AUDIT_OUTPUT || 'docs/screenshots/earth-scene-repair'); await mkdir(output,{recursive:true});
const report={stage,externalFailures:[],environment:'Chromium with real cached CelesTrak; no native WebView FPS acceptance',errors:[],quality:[],presets:[]};
const browser=await chromium.launch({headless:true,executablePath:process.env.ORBITAL_CHROMIUM});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await context.addInitScript(() => {
   window.sceneAudit = { bulk: 0, selected: 0, phase: 'startup', longTasks: [] };
   const OriginalWorker = window.Worker;
   window.Worker = class extends OriginalWorker {
     constructor(url, options) {
       super(url, options);
       if(options?.name === 'orbital-vision-sgp4') this.addEventListener('message', event => {
         if(event.data?.type === 'frame') window.sceneAudit.bulk++;
         if(event.data?.type === 'selected-frame') window.sceneAudit.selected++;
       });
     }
   };
   new PerformanceObserver(list => window.sceneAudit.longTasks.push(...list.getEntries().map(entry=>({duration:entry.duration,start:entry.startTime,phase:window.sceneAudit.phase})))).observe({type:'longtask',buffered:true});
 });
 await context.route('**/__earth_qa_catalog.json',route=>route.fulfill({json:payload}));
 if(process.env.ORBITAL_OFFLINE!=='0') await context.route(/https:\/\/.*arcgis.*/,route=>route.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 page.on('requestfailed',request=>{if(request.url().startsWith('https:'))report.externalFailures.push({host:new URL(request.url()).hostname,error:request.failure()?.errorText});});
 await page.goto('http://127.0.0.1:1426/tests/earth-visual.html');
 await page.waitForFunction(()=>window.qa?.engine&&window.qa.satelliteLayer()?.getSnapshot().status==='ready',null,{timeout:90000});
 if(process.env.ORBITAL_OFFLINE==='0') await page.waitForFunction(()=>window.qa.engine.getSnapshot().imagery!=='loading',null,{timeout:15000}).catch(()=>{});
 await page.waitForTimeout(1500);
 const sample=()=>page.evaluate(()=>{
  const e=window.qa.engine,c=e.widget.camera,s=e.getSnapshot(),l=window.qa.satelliteLayer();
  return {quality:s.quality,preset:s.activePreset,resolution:e.widget.resolutionScale,width:e.widget.canvas.width,height:e.widget.canvas.height,signals:l.getSnapshot().signalCount,phase:s.phase,imagery:s.imagery,terrain:s.terrain,gpu:s.gpu,worldPosition:{x:c.positionWC.x,y:c.positionWC.y,z:c.positionWC.z},earthCenter:window.qa.project(),fps:s.fps,cpuRenderMs:s.cpuRenderMs,renderMode:s.renderMode};
 });
 for(const quality of ['eco','balanced','high']){
  await page.evaluate(q=>window.sceneAudit.phase='quality-'+q,quality);
  await page.evaluate(async quality=>{const {usePreferencesStore}=await import('/src/features/settings/model/preferences.ts');usePreferencesStore.getState().setGraphicsQuality(quality);},quality);
  await page.waitForTimeout(1000);report.quality.push({requested:quality,...await sample()});
  await page.screenshot({path:join(output,`${stage}-${quality}.png`)});
 }
 for(const preset of ['earth','moon','sun','leo','iss','earth']){
  await page.evaluate(p=>window.sceneAudit.phase='preset-'+p,preset);
  await page.evaluate(preset=>window.qa.engine.flyTo(preset),preset);await page.waitForTimeout(1000);
  report.presets.push(await sample()); await page.screenshot({path:join(output,`${stage}-${preset}.png`)});
 }
 await page.evaluate(()=>window.sceneAudit.phase='select-focus');
 await page.evaluate(()=>window.qa.select('norad:25544'));await page.waitForSelector('.object-inspector');await page.waitForTimeout(1500);
 await page.screenshot({path:join(output,`${stage}-selected.png`)});
 await page.evaluate(()=>window.qa.satelliteLayer().setFollowSelected(true));await page.waitForTimeout(1000);
 await page.screenshot({path:join(output,`${stage}-follow.png`)});
 await page.evaluate(()=>window.sceneAudit.phase='close-focus');
 await page.keyboard.press('Escape');await page.waitForTimeout(1200);
 report.closed=await sample();await page.screenshot({path:join(output,`${stage}-closed.png`)});
 if(stage==='after') {
  report.defaultComposition=await page.evaluate(()=>{
   const e=window.qa.engine,insets=e.cameraController.defaultCompositionInsets,center=window.qa.project();
   return {center,expected:{x:(innerWidth+insets.left-insets.right)/2,y:(innerHeight+insets.top-insets.bottom)/2}};
  });
  if(Math.hypot(report.defaultComposition.center.x-report.defaultComposition.expected.x,report.defaultComposition.center.y-report.defaultComposition.expected.y)>4)throw new Error('Earth is not centred in the usable viewport');
  if(report.quality.some(item=>item.requested!==item.quality))throw new Error('Quality selection silently changed');
  if(!(report.quality[0].width < report.quality[1].width && report.quality[1].width < report.quality[2].width))throw new Error('Quality profiles did not change output resolution');
  await page.evaluate(()=>window.qa.select('norad:25544'));
  await page.waitForSelector('.object-inspector'); await page.waitForTimeout(300);
  await page.evaluate(()=>window.qa.satelliteLayer().setFollowSelected(true));
  const initial=await page.evaluate(()=>({...window.sceneAudit}));
  await page.waitForTimeout(1600);
  report.selectedCadence=await page.evaluate(initial=>({bulk:window.sceneAudit.bulk-initial.bulk,selected:window.sceneAudit.selected-initial.selected}),initial);
  if(report.selectedCadence.selected<3 || report.selectedCadence.bulk>3)throw new Error('Selected target cadence is not independent of the bulk catalog');
  await page.getByRole('button',{name:/^Moon ·/}).click();await page.waitForTimeout(400);
  if(await page.locator('.object-inspector').count())throw new Error('Preset retained the inspector');
  const range=()=>page.evaluate(()=>Math.hypot(...['x','y','z'].map(key=>window.qa.engine.widget.camera.position[key])));
  const beforeZoom=await range();await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(650);
  if(await range()>=beforeZoom)throw new Error('Moon zoom button does not work');
  const paused=await page.evaluate(()=>({...window.sceneAudit}));await page.waitForTimeout(800);
  report.celestialWorkerPause=await page.evaluate(paused=>window.sceneAudit.bulk===paused.bulk&&window.sceneAudit.selected===paused.selected,paused);
  if(!report.celestialWorkerPause)throw new Error('Earth propagation continued in a celestial view');
  await page.evaluate(()=>window.sceneAudit.phase='responsive-resize');
  report.layouts=[];
  for(const preset of ['Moon','Sun']) {
   await page.getByRole('button',{name:new RegExp('^'+preset+' ·')}).click();await page.waitForTimeout(300);
   for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
    report.layouts.push(await page.evaluate(preset=>({preset,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,phase:window.qa.engine.getSnapshot().phase}),preset));
    await page.screenshot({path:join(output,'after-'+preset.toLowerCase()+'-'+width+'.png')});
   }
  }
  if(report.layouts.some(item=>item.overflow||item.phase==='error'))throw new Error('Celestial layout failed');
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:/^Earth ·/}).click();await page.waitForTimeout(300);
  await page.evaluate(()=>{window.sceneAudit.phase='repeated-select-close';window.qa.motion(true);});
  for(let i=0;i<12;i++){
   await page.evaluate(()=>window.qa.select('norad:25544'));await page.waitForSelector('.object-inspector');
   await page.keyboard.press('Escape');await page.waitForSelector('.object-inspector',{state:'detached'});
  }
  await page.waitForTimeout(2600);
  report.repeatedClose=await page.evaluate(()=>({selected:window.qa.satelliteLayer().getSnapshot().selectedId,follow:window.qa.satelliteLayer().getSnapshot().followSelected,phase:window.qa.engine.getSnapshot().phase}));
  if(report.repeatedClose.selected || report.repeatedClose.follow || report.repeatedClose.phase==='error')throw new Error('Repeated close left stale focus');
  await page.evaluate(()=>{window.sceneAudit.phase='animated-focus-follow-close';window.qa.select('norad:25544');});
  await page.waitForSelector('.object-inspector');await page.waitForTimeout(1600);
  await page.evaluate(()=>window.qa.satelliteLayer().setFollowSelected(true));await page.waitForTimeout(500);
  await page.keyboard.press('Escape');await page.waitForTimeout(2600);
  report.animatedClose=await page.evaluate(()=>({phase:window.qa.engine.getSnapshot().phase,selected:window.qa.satelliteLayer().getSnapshot().selectedId,follow:window.qa.satelliteLayer().getSnapshot().followSelected}));
  if(report.animatedClose.phase==='error'||report.animatedClose.selected||report.animatedClose.follow)throw new Error('Animated follow close left stale state');
  report.longTasks=await page.evaluate(()=>({count:window.sceneAudit.longTasks.length,maxMs:Math.max(0,...window.sceneAudit.longTasks.map(t=>t.duration)),over200ms:window.sceneAudit.longTasks.filter(t=>t.duration>200)}));
 }
 await page.evaluate(()=>window.qa.unmount());
}finally{await browser.close();await writeFile(join(output,`${stage}.json`),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
