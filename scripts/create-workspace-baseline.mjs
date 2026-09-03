import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Private, local recovery copy. Never include runtime credentials or build caches.
const root = await realpath(process.cwd());
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = join(root, ".release-baselines", stamp);
const paths = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root })
  .toString("utf8").split("\0").filter(Boolean))];
const status = execFileSync("git", ["status", "--porcelain=v1", "-z"], { cwd: root }).toString("utf8");
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString("utf8").trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = [];
const excluded = [];
for (const name of paths) {
  if (/^(?:\.release-baselines|node_modules|dist|\.git)\//.test(name)
    || /(?:^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:key|p12|pfx|p8|pem))$/i.test(name)) {
    excluded.push(name);
    continue;
  }
  const source = resolve(root, name);
  const local = relative(root, source);
  if (!local || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error("Invalid baseline source");
  const info = await lstat(source).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (!info) continue; // Tracked deletions are retained in the status manifest.
  if (!info.isFile() || info.isSymbolicLink() || await realpath(source) !== source) throw new Error(`Unsafe baseline entry: ${name}`);
  const target = join(destination, "files", local);
  await mkdir(dirname(target), { recursive: true });
  const before = sha256(await readFile(source));
  await copyFile(source, target);
  if (sha256(await readFile(target)) !== before || sha256(await readFile(source)) !== before) throw new Error(`Baseline verification failed: ${name}`);
  entries.push({ path: name, sha256: before, bytes: info.size });
}
const manifest = JSON.stringify({ createdAt: new Date().toISOString(), head, status, excluded, entries }, null, 2);
await writeFile(join(destination, "manifest.json"), manifest);
await writeFile(join(destination, "manifest.sha256"), sha256(manifest));
console.log(`Verified ${entries.length} files. Recovery copy: ${destination}`);
