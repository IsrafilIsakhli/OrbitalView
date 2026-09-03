import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.resolve("vite"));
const postcss = require("postcss");
async function walk(dir) { const out = []; for (const e of await readdir(dir, { withFileTypes: true })) { const p = join(dir,e.name); if(e.isDirectory()) out.push(...await walk(p)); else out.push(p); } return out; }
const files = await walk("src");
const source = (await Promise.all(files.filter(p => /\.(tsx?|html)$/.test(p)).map(p => readFile(p,"utf8")))).join("\n");
const all = [];
for (const file of files.filter(p => p.endsWith(".css"))) {
  const root = postcss.parse(await readFile(file,"utf8"));
  const unused = new Map(); let bytes = 0;
  root.walkRules(rule => {
    const classes = [...rule.selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]);
    const missing = classes.filter(c => !new RegExp(`(?<![\\w-])${c}(?![\\w-])`).test(source) && !c.startsWith("cesium-") && !source.includes(c.split("--")[0]+"--${"));
    if (missing.length && rule.selectors.every(sel => missing.some(c => sel.includes("."+c)))) {
      for (const c of missing) unused.set(c,(unused.get(c)??0)+rule.toString().length);
      bytes += rule.toString().length;
    }
  });
  all.push({file,bytes,classes:[...unused.entries()].sort((a,b)=>b[1]-a[1])});
}
console.log(JSON.stringify(all,null,2));
