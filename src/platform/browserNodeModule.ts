/**
 * Browser-only replacement for Emscripten's unreachable Node.js loading branch.
 * The satellite Worker always runs inside WebView2, where that branch is false.
 */
export function createRequire(): never {
  throw new Error("Node.js module loading is unavailable in the browser runtime.");
}
