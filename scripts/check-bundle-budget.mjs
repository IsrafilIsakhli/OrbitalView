import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const directory = "dist/assets";
const files = await readdir(directory);
let css = 0;
const failures = [];
let largest = { filename: "", bytes: 0 };
for (const filename of files) {
  const { size } = await stat(join(directory, filename));
  if (filename.endsWith(".css")) css += size;
  if (filename.endsWith(".js") && !filename.startsWith("cesium-engine-")) {
    if (size > largest.bytes) largest = { filename, bytes: size };
    if (size > 550_000) failures.push(`${filename}: ${size} > 550000 bytes`);
  }
}
if (css > 150_000) failures.push(`Total CSS: ${css} > 150000 bytes`);
console.log(JSON.stringify({ largestNonCesiumChunk: largest, totalCssBytes: css, measurement: "uncompressed" }, null, 2));
if (failures.length) throw new Error(failures.join("\n"));
