import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const directory = "dist/assets";
const files = await readdir(directory);
let css = 0;
const failures = [];
let largest = { filename: "", bytes: 0 };
let largestCss = { filename: "", bytes: 0 };
let initialCssBytes = 0;
for (const filename of files) {
  const { size } = await stat(join(directory, filename));
  if (filename.endsWith(".css")) {
    css += size;
    if (size > largestCss.bytes) largestCss = { filename, bytes: size };
    if (filename.startsWith("index-")) initialCssBytes += size;
    if (size > 150_000) failures.push(`${filename}: ${size} > 150000 CSS bytes`);
  }
  if (filename.endsWith(".js") && !filename.startsWith("cesium-engine-")) {
    if (size > largest.bytes) largest = { filename, bytes: size };
    if (size > 550_000) failures.push(`${filename}: ${size} > 550000 bytes`);
  }
}
console.log(JSON.stringify({
  initialCssBytes,
  largestCssChunk: largestCss,
  largestNonCesiumChunk: largest,
  measurement: "uncompressed",
  totalRouteCssBytes: css,
}, null, 2));
if (failures.length) throw new Error(failures.join("\n"));
