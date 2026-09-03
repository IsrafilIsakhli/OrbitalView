import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import styleCascade from "./style-cascade.mjs";
const postcss = createRequire(import.meta.resolve("vite"))("postcss");
const compile = async (css) => (await postcss([styleCascade()]).process(css, { from: undefined })).css;

test("removes only overridden exact selectors within the same conditional scope", async () => {
  const css = await compile(".a{color:red;width:2px}.b{color:yellow}.a{color:blue}@media(max-width:400px){.a{color:green}}");
  assert(!css.includes("red")); assert(css.includes("width:2px")); assert(css.includes("green")); assert(css.includes("yellow"));
});
test("keeps important declarations, keyframes, and live status styles", async () => {
  const css = await compile(".a{color:red!important}.a{color:blue}.status-chip{color:green}@keyframes spin{from{opacity:0}to{opacity:1}}.freshness-stamp{color:orange}");
  assert(css.includes("red!important")); assert(css.includes("status-chip")); assert(css.includes("opacity:0")); assert(!css.includes("freshness-stamp"));
});
test("handles grouped selectors and later unconditional overrides without moving rules", async () => {
  const css = await compile(".a,.b{color:red;width:1px}@media(max-width:400px){.a{color:green}}.a{color:blue}");
  assert(css.includes(".b{color:red;width:1px}"));
  assert(!css.includes("green")); assert(css.includes(".a{color:blue}"));
});
