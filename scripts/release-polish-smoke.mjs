import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.ORBITAL_PLAYWRIGHT_MODULE).href);
const cache=process.env.ORBITAL_CATALOG_CACHE;
const [orbital,recent,catalog,recentCatalog]=await Promise.all(['orbital.json','recent-orbital.json','catalog.json','recent-catalog.json'].map(async name=>JSON.parse(await readFile(join(cache,name),'utf8'))));
const unique=records=>[...new Map(records.map(record=>[String(record.NORAD_CAT_ID),record])).values()];
const payload={orbital:unique([...orbital.data,...recent.data]),catalog:unique([...catalog.data,...recentCatalog.data]),metadata:{catalogObjectCount:catalog.objectCount,expiresAt:new Date(orbital.expiresAtUnixMs).toISOString(),fetchedAt:new Date(orbital.fetchedAtUnixMs).toISOString(),source:'CelesTrak real local cache',stale:true}};
const output=resolve('docs/screenshots/release-polish');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.ORBITAL_CHROMIUM});
const report={environment:'Chromium with real cached CelesTrak; not native FPS acceptance',errors:[],layouts:[]};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.route('**/__earth_qa_catalog.json',route=>route.fulfill({json:payload}));
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto('http://127.0.0.1:1426/tests/release-visual.html');
 await page.getByRole('button',{name:'Run analysis',exact:true}).click({timeout:60000});
 await page.locator('.analysis-radius').waitFor({timeout:60000});
 await page.locator('.analysis-chart .uplot').nth(3).waitFor();
 const slider=page.locator('.analysis-radius input');
 const first=await page.locator('.analysis-radius time').textContent();
 await slider.fill('180');
 const next=await page.locator('.analysis-radius time').textContent();
 report.sliderChangedTime=first!==next;
 for(const [width,height] of [[1440,1000],[768,1024],[390,844],[320,568]]){
  await page.setViewportSize({width,height});await page.locator('.analysis-radius').scrollIntoViewIfNeeded();
  if(await slider.inputValue()!=='180') throw new Error('Resize changed selected analysis instant');
  report.layouts.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));
  await page.screenshot({path:join(output,`radius-${width}.png`)});
 }
 await page.setViewportSize({width:1440,height:1000});
 for(const locale of ['az','tr','ru','es']){
  await page.goto(`http://127.0.0.1:1426/tests/release-visual.html?locale=${locale}`);
  await page.locator('.analysis-control-card button').click({timeout:60000});
  await page.locator('.analysis-radius').waitFor({timeout:60000});
  await page.locator('.analysis-radius').scrollIntoViewIfNeeded();
  await page.screenshot({path:join(output,`radius-${locale}.png`)});
 }
 await page.goto('http://127.0.0.1:1426/tests/release-visual.html?mode=news');
 await page.locator('.space-news-header').waitFor();
 report.newsProviderLabelRemoved=!(await page.locator('.space-news-header').textContent()).includes('API v4');
 await page.screenshot({path:join(output,'news-header.png')});
 await page.goto('http://127.0.0.1:1426/tests/release-visual.html?mode=settings');
 await page.locator('.settings-panel[open]').waitFor();
 report.nasaKeyRemoved=await page.locator('.settings-panel input[type=password]').count()===0 && !(await page.locator('.settings-panel').textContent()).includes('NASA API');
 await page.screenshot({path:join(output,'settings.png')});
}finally{await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
if(report.errors.length||report.layouts.some(item=>item.overflow)||!report.sliderChangedTime||!report.nasaKeyRemoved||!report.newsProviderLabelRemoved)process.exitCode=1;
