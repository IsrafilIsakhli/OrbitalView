// Heuristic release gate: reports locations only, never matching secret material.
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["github-token", /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/],
  ["aws-access-key", /AKIA[0-9A-Z]{16}/],
  ["minisign-secret", /untrusted comment: minisign encrypted secret key\r?\n[A-Za-z0-9+/=]{50,}/],
];
const ignored = /(?:^|\/)(?:node_modules|target|dist|\.release-baselines|\.git)(?:\/|$)/;
const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const findings = [];
let scanned = 0;
for (const path of new Set(paths)) {
  if (ignored.test(path) || [".png", ".jpg", ".webp", ".ico", ".woff2", ".pdf"].includes(extname(path))) continue;
  const file = resolve(path);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile() || info.size > 2_000_000) continue;
  const text = await readFile(file, "utf8");
  if (text.includes("\0")) continue;
  scanned++;
  for (const [rule, pattern] of rules) {
    const match = pattern.exec(text);
    if (match) findings.push({ path, rule, line: text.slice(0, match.index).split("\n").length });
  }
}
console.log(JSON.stringify({ scanned, findings, scope: "tracked and non-ignored working-tree text files; heuristic, not a history or entropy scan" }, null, 2));
if (findings.length) process.exitCode = 1;
