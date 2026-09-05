// Isolated, read-only native-cache input. No provider mocks enter the shipped app.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.ORBITAL_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
const cache = process.env.ORBITAL_CATALOG_CACHE;
if (!cache) throw new Error('Set ORBITAL_CATALOG_CACHE to the real satellite-catalog-v1 directory');
const base = process.env.ORBITAL_SMOKE_URL ?? 'http://127.0.0.1:1426';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Local test server required');
const read = async name => JSON.parse(await readFile(join(cache, name), 'utf8'));
const [orbital, recent, catalog, recentCatalog] = await Promise.all(['orbital.json', 'recent-orbital.json', 'catalog.json', 'recent-catalog.json'].map(read));
const unique = records => [...new Map(records.map(record => [String(record.NORAD_CAT_ID), record])).values()];
const payload = {
  orbital: unique([...orbital.data, ...recent.data]), catalog: unique([...catalog.data, ...recentCatalog.data]),
  metadata: { catalogObjectCount: catalog.objectCount, expiresAt: new Date(orbital.expiresAtUnixMs).toISOString(), fetchedAt: new Date(orbital.fetchedAtUnixMs).toISOString(), source: 'CelesTrak (real local cache)', stale: Date.now() > orbital.expiresAtUnixMs },
};
const output = resolve(process.env.ORBITAL_SMOKE_OUTPUT ?? 'docs/screenshots/earth-0.2.0');
await mkdir(output, { recursive: true });
const report = { environment: 'Isolated Chromium; real cached CelesTrak; current UTC; not native WebView/installer or FPS acceptance', hash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), fetchedAt: payload.metadata.fetchedAt, cases: [], errors: [], samples: [] };
const browser = await chromium.launch({ headless: true, executablePath: process.env.ORBITAL_CHROMIUM });
const watchdog = setTimeout(() => {
  report.errors.push('QA exceeded its three-minute bound; no release acceptance recorded');
  void browser.close();
}, 180_000);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.workerAudit = { created: 0, live: 0, frames: 0 };
    window.Worker = class extends OriginalWorker {
      constructor(url, options) {
        super(url, options);
        this.orbital = options?.name === 'orbital-vision-sgp4';
        if (this.orbital) {
          window.workerAudit.created++; window.workerAudit.live++;
          this.addEventListener('message', event => { if (event.data?.type === 'frame') window.workerAudit.frames++; });
        }
      }
      terminate() { if (this.orbital) { window.workerAudit.live--; this.orbital = false; } super.terminate(); }
    };
  });
  await context.route('**/__earth_qa_catalog.json', route => route.fulfill({ json: payload }));
  // Deterministic offline imagery case; bundled NASA surfaces/clouds stay real.
  await context.route(/https:\/\/.*arcgis.*|https:\/\/services\.arcgisonline\.com.*/, route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`${base}/tests/earth-visual.html?quality=high`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.qa?.engine && document.querySelector('.earth-viewport')?.getAttribute('data-satellite-status') === 'ready', { timeout: 90000 });
  await page.waitForTimeout(3000);
  report.initial = await page.evaluate(() => ({ snapshot: window.qa.engine.getSnapshot(), count: window.qa.catalog.satellites.length, shell: Boolean(window.qa.engine.cloudLayer?.shell), shellVisible: window.qa.engine.cloudLayer?.shell?.show, imageryVisible: window.qa.engine.cloudLayer?.layer?.show }));
  await page.evaluate(() => { window.frameAudit = 0; window.qa.engine.widget.scene.postRender.addEventListener(() => window.frameAudit++); });
  for (const [width, height] of [[320,568],[390,844],[768,1024],[1440,900],[1920,1080],[3840,2160]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(150);
    await page.evaluate(() => window.qa.engine.flyTo('earth'));
    await page.waitForTimeout(350);
    report.cases.push(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, phase: window.qa.engine.getSnapshot().phase, center: window.qa.project(), insets: window.qa.engine.cameraController.defaultCompositionInsets })));
    await page.screenshot({ path: join(output, `earth-${width}x${height}.png`) });
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button', {name:'Layers', exact:true}).click();
  await page.screenshot({path:join(output,'earth-layers.png')});
  await page.evaluate(() => window.qa.select('norad:25544'));
  await page.waitForSelector('.object-inspector');
  await page.waitForTimeout(1200);
  await page.screenshot({path:join(output,'earth-inspector.png')});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  report.drawerRestored = await page.getByRole('button', {name:'Layers',exact:true}).getAttribute('aria-expanded');
  report.focusRestored = await page.evaluate(() => document.activeElement?.hasAttribute('data-earth-focus-target') || document.activeElement?.getAttribute('aria-controls') === 'earth-layer-panel');
  const primitiveCount = () => page.evaluate(() => ({ scene: window.qa.engine.widget.scene.primitives.length, satellite: window.qa.satelliteLayer().getSnapshot().primitiveCount }));
  report.primitivesBefore = await primitiveCount();
  for (let i=0;i<50;i++) await page.evaluate(() => { const layer=window.qa.satelliteLayer(); layer.setCategoryVisible('starlink',false); layer.setCategoryVisible('starlink',true); });
  for (let i=0;i<20;i++) {
    await page.evaluate(() => window.qa.select('norad:25544'));
    await page.waitForSelector('.object-inspector');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.object-inspector', {state:'detached'});
  }
  await page.waitForTimeout(800);
  report.primitivesAfter = await primitiveCount();
  report.locales = [];
  await page.getByRole('button', {name:'Layers',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  for (const locale of ['az','tr','en','ru','es']) {
    await page.evaluate(locale => window.qa.locale(locale), locale);
    await page.waitForTimeout(150);
    report.locales.push(await page.evaluate(locale => ({locale, overflow: document.documentElement.scrollWidth > innerWidth}),locale));
    await page.screenshot({path:join(output,`earth-locale-${locale}.png`)});
  }
  await page.evaluate(() => window.qa.locale('en'));
  await page.locator('.earth-time-lens-button').click();
  await page.locator('.orbital-time-lens__rates button').last().click();
  await page.locator('.orbital-time-lens__play').click();
  await page.waitForTimeout(1200);
  report.timeLensPlayback = await page.evaluate(() => window.qa.engine.getSnapshot().renderMode);
  await page.screenshot({path:join(output,'earth-time-lens-mobile.png')});
  await page.evaluate(() => window.qa.active(false));
  await page.waitForTimeout(100);
  const forecastBefore = await page.evaluate(() => window.qa.clockTime());
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.qa.active(true));
  await page.waitForTimeout(50);
  report.forecastResumeDeltaMs = (await page.evaluate(() => window.qa.clockTime())) - forecastBefore;
  await page.locator('.orbital-time-lens__now').click();
  // NOW resets the paused forecast cursor; close is the existing return-to-real-time action.
  await page.locator('.orbital-time-lens__close').click();
  await page.waitForTimeout(1200);
  report.timeLensReturn = await page.evaluate(() => ({ active:window.qa.engine.getSnapshot().timeLensActive, deltaMs:Math.abs(Date.parse(window.qa.engine.getSnapshot().utcIso)-Date.now()) }));
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(() => window.qa.engine.flyTo('earth'));
  for (let i=0;i<50;i++) { await page.evaluate(() => window.qa.active(false)); await page.evaluate(() => window.qa.active(true)); }
  await page.evaluate(() => window.qa.active(false));
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ ...window.qa.engine.getSnapshot(), actualFrames: window.frameAudit, workers: {...window.workerAudit} }));
  await page.waitForTimeout(1800);
  const after = await page.evaluate(() => ({ ...window.qa.engine.getSnapshot(), actualFrames: window.frameAudit, workers: {...window.workerAudit} }));
  report.suspension = { before: before.actualFrames, after: after.actualFrames, workerBefore: before.workers, workerAfter: after.workers, mode: after.renderMode, defaultLoop: await page.evaluate(() => window.qa.engine.widget.useDefaultRenderLoop) };
  report.resumeMs = await page.evaluate(() => new Promise(resolve => {
    const began=performance.now();
    const timeout=setTimeout(() => { remove(); resolve(null); },5000);
    const remove=window.qa.engine.widget.scene.postRender.addEventListener(() => { remove(); clearTimeout(timeout); resolve(performance.now()-began); });
    window.qa.active(true);
  }));
  await page.waitForTimeout(300);
  report.updateVeto = await page.evaluate(() => {
    const engine=window.qa.engine;
    engine.setUpdatePaused(true); engine.setWindowVisible(false); engine.setActive(false);
    engine.setWindowVisible(true); engine.setActive(true);
    const mode=engine.getSnapshot().renderMode;
    engine.setUpdatePaused(false); return mode;
  });
  // A short instrument check, not a before/after reference benchmark. Freeze high
  // so adaptation cannot silently change the quality of this measured scenario.
  await page.evaluate(() => {
    window.qa.motion(true);
    window.qa.engine.readyAt = Infinity;
    window.qa.engine.applyQuality('high');
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => { const engine=window.qa.engine; engine.setAutoRotation(true); engine.cameraController.lastInteractionAt=-Infinity; engine.syncRenderPolicy(); });
  for (let i=0;i<12;i++) {
    await page.waitForTimeout(1000);
    report.samples.push(await page.evaluate(() => window.qa.engine.getSnapshot()));
  }
  await page.evaluate(() => window.qa.engine.setAutoRotation(false));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1441,height:900,deviceScaleFactor:2,mobile:false});
  await page.waitForTimeout(500);
  report.highDpi = await page.evaluate(() => ({dpr:devicePixelRatio, scale:window.qa.engine.widget.resolutionScale, width:window.qa.engine.widget.canvas.width,height:window.qa.engine.widget.canvas.height}));
  await page.screenshot({path:join(output,'earth-high-dpi.png')});
  await cdp.detach();
  report.cloudFallback = await page.evaluate(() => {
    const engine=window.qa.engine;
    engine.widget.scene.renderError.raiseEvent(engine.widget.scene, new Error('QA optional shell failure'));
    return { shell: Boolean(engine.cloudLayer.shell), imageryVisible:engine.cloudLayer.layer?.show, phase:engine.getSnapshot().phase };
  });
  await page.waitForTimeout(300);
  report.final = await page.evaluate(() => window.qa.engine.getSnapshot());
  report.fatalErrorPause = await page.evaluate(() => {
    const engine=window.qa.engine;
    engine.widget.scene.renderError.raiseEvent(engine.widget.scene, new Error('QA non-cloud render failure'));
    return { phase:engine.getSnapshot().phase, mode:engine.getSnapshot().renderMode };
  });
  await page.evaluate(() => window.qa.unmount());
  report.disposedCanvases = await page.locator('canvas').count();
  report.disposedWorkers = await page.evaluate(() => window.workerAudit.live);
  await context.close();
} finally {
  clearTimeout(watchdog);
  await browser.close();
  await writeFile(join(output,'browser-report.json'), JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
if (report.forecastResumeDeltaMs > 15000 || report.forecastResumeDeltaMs < 0 || !report.focusRestored || report.highDpi.scale > 1.5 || report.highDpi.width * report.highDpi.height > 8300001) process.exitCode=1;
if (report.errors.length || report.cases.some(c=>c.overflow||c.phase==='error') || report.locales.some(c=>c.overflow) || report.suspension?.mode !== 'suspended' || report.suspension?.before !== report.suspension?.after || report.suspension?.workerBefore.frames !== report.suspension?.workerAfter.frames || report.disposedWorkers !== 0 || report.disposedCanvases !== 0 || report.drawerRestored !== 'true' || report.updateVeto !== 'suspended' || report.timeLensReturn.active || report.timeLensReturn.deltaMs > 2500 || !report.cloudFallback.imageryVisible || report.cloudFallback.phase === 'error' || report.fatalErrorPause.mode !== 'suspended' || JSON.stringify(report.primitivesBefore) !== JSON.stringify(report.primitivesAfter)) process.exitCode=1;
