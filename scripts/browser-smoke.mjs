// Isolated browser/no-native-provider smoke test. Does not validate native rendering or FPS.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const library = process.env.ORBITAL_PLAYWRIGHT_MODULE;
const { chromium } = await import(library ? pathToFileURL(resolve(library)).href : "playwright");
const baseUrl = process.env.ORBITAL_SMOKE_URL ?? "http://127.0.0.1:1425";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseUrl)) throw new Error("Smoke test only supports a local preview");
const output = resolve("docs/screenshots/release-candidate");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { environment: "Chromium browser without Tauri/native providers; not native or real-data QA", cases: [], errors: [] };
try {
  for (const locale of ["en", "az", "tr", "ru", "es"]) {
    const context = await browser.newContext({ locale, reducedMotion: "reduce" });
    await context.addInitScript((locale) => {
      localStorage.setItem("orbital-vision.preferences", JSON.stringify({ state: { locale, reduceMotion: true }, version: 2 }));
    }, locale);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push({ locale, message: error.message }));
    const sizes = locale === "en" ? [[320, 568], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [3840, 2160]] : [[390, 844], [1440, 900]];
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator(".command-dashboard").waitFor({ state: "visible" });
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, language: document.documentElement.lang }));
      report.cases.push({ locale, width, height, ...dimensions, overflow: dimensions.scroll > dimensions.width + 1 });
      await page.screenshot({ path: join(output, `browser-no-native-${locale}-${width}x${height}.png`) });
    }
    if (locale === "en") {
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const [name, selector] of [["Launches", ".launch-state"], ["Missions", ".launch-state"], ["Space News", ".space-news-page"], ["Orbital Analysis", ".orbital-analysis-page"], ["Favorites", ".awareness-dashboard"], ["Notifications", ".notification-dashboard"]]) {
        await page.getByRole("button", { name, exact: true }).first().click();
        await page.locator(`[aria-label="${name}"][aria-current="page"]`).waitFor({ state: "visible" });
        await page.locator(selector).first().waitFor({ state: "visible" });
        if (name === "Launches" || name === "Missions") {
          await page.getByRole("heading", { name: "Launch intelligence is temporarily unavailable", exact: true }).waitFor({ state: "visible" });
        }
        report.cases.push({ workspace: name, heading: await page.locator("h1").last().textContent() });
      }
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Ultra", exact: true }).waitFor({ state: "visible" });
      report.cases.push({ workspace: "Settings", lazyLoad: "passed" });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(join(output, "browser-smoke.json"), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
if (report.errors.length || report.cases.some((item) => item.overflow || (item.language && item.language !== item.locale))) process.exitCode = 1;
