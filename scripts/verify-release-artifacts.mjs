import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertReleaseChannel, releaseRepository } from "./release-channel.mjs";

export async function verifyReleaseArtifacts(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, "release-manifest.json"), "utf8"));
  const latest = JSON.parse(await readFile(join(root, "latest.json"), "utf8"));
  assertReleaseChannel(releaseRepository, manifest.version, manifest.tag);
  if (manifest.schemaVersion !== 1 || latest.version !== manifest.version || !Number.isFinite(Date.parse(manifest.publishedAt))) throw new Error("Invalid release metadata");
  const expected = new Set(["windows/x86_64/nsis", "windows/x86_64/msi", "macos/universal/dmg", ...["x86_64", "aarch64"].flatMap((arch) => ["appimage", "deb", "rpm"].map((format) => `linux/${arch}/${format}`))]);
  const permitted = new Set(["latest.json", "release-manifest.json", "update-policy.json", "SHA256SUMS.txt"]);
  const hash = async (file) => {
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(join(root, file))) digest.update(chunk);
    return digest.digest("hex");
  };
  const validateUrl = (url, filename) => {
    if (url !== `https://github.com/${releaseRepository}/releases/download/${manifest.tag}/${encodeURIComponent(filename)}`) throw new Error("Unsafe or mismatched artifact URL");
    if (!/^orbital-vision-[A-Za-z0-9._+-]+$/.test(filename)) throw new Error("Unsafe artifact filename");
  };
  for (const item of manifest.installers) {
    if (!expected.delete(`${item.platform}/${item.architecture}/${item.format}`)) throw new Error("Unexpected or duplicate package");
    validateUrl(item.downloadUrl, item.filename);
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || await hash(item.filename) !== item.sha256) throw new Error("Checksum mismatch");
    if (item.sizeBytes !== (await stat(join(root, item.filename))).size || item.sizeBytes <= 0) throw new Error("Invalid installer size");
    if (!item.trust || typeof item.trust.requiresManualSecurityApproval !== "boolean") throw new Error("Missing trust metadata");
    permitted.add(item.filename);
  }
  if (expected.size) throw new Error(`Missing installer platforms: ${[...expected].join(", ")}`);
  for (const target of ["windows-x86_64-nsis", "windows-x86_64-msi", "darwin-x86_64", "darwin-aarch64", "linux-x86_64", "linux-aarch64"]) {
    const item = latest.platforms?.[target];
    if (!item?.signature || !/^[A-Za-z0-9+/=\r\n]+$/.test(item.signature)) throw new Error(`Missing updater signature: ${target}`);
    const filename = decodeURIComponent(new URL(item.url).pathname.split("/").at(-1));
    validateUrl(item.url, filename);
    const extension = target.endsWith("msi") ? ".msi" : target.startsWith("windows") ? ".exe" : target.startsWith("linux") ? ".AppImage" : ".tar.gz";
    if (!filename.endsWith(extension)) throw new Error("Updater package mismatch");
    if ((await readFile(join(root, `${filename}.sig`), "utf8")).trim() !== item.signature) throw new Error("Updater signature mismatch");
    permitted.add(filename); permitted.add(`${filename}.sig`);
  }
  const files = await readdir(root, { withFileTypes: true });
  const checksums = [];
  for (const entry of files.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !permitted.has(entry.name)) throw new Error(`Unexpected public artifact: ${entry.name}`);
    if (entry.name !== "SHA256SUMS.txt") checksums.push(`${await hash(entry.name)}  ${entry.name}`);
  }
  await writeFile(join(root, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
  return { installers: manifest.installers.length, files: checksums.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: verify-release-artifacts <publish-directory>");
  console.log(await verifyReleaseArtifacts(process.argv[2]));
}
