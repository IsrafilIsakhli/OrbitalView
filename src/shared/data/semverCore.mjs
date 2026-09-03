// SemVer 2.0 precedence: build metadata is ignored; numeric prerelease IDs compare numerically.
const pattern = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemanticVersion(value) {
  const match = pattern.exec(value);
  if (!match) throw new Error("invalid-semver");
  const core = match.slice(1, 4).map(Number);
  const pre = match[4]?.split(".") ?? [];
  if (core.some((part) => !Number.isSafeInteger(part)) || pre.some((part) => /^0\d+$/.test(part))) throw new Error("invalid-semver");
  return { core, pre };
}

export function isSemanticVersion(value) {
  try { parseSemanticVersion(value); return true; } catch { return false; }
}

export function compareSemanticVersions(left, right) {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  for (let i = 0; i < 3; i++) {
    const delta = a.core[i] - b.core[i];
    if (delta) return Math.sign(delta);
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return x.length !== y.length ? Math.sign(x.length - y.length) : x < y ? -1 : 1;
    if (xn !== yn) return xn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}
