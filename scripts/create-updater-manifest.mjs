import { assertReleaseChannel } from "./release-channel.mjs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

const [artifactRootArg, versionArg, repositoryArg, tagArg, policyPathArg] = process.argv.slice(2);

if (!artifactRootArg || !versionArg || !repositoryArg || !tagArg || !policyPathArg) {
  throw new Error("Usage: create-updater-manifest <artifact-root> <version> <owner/repo> <tag> <policy-path>");
}

assertReleaseChannel(repositoryArg, versionArg, tagArg);
const artifactRoot = resolve(artifactRootArg);
const publishRoot = join(artifactRoot, "publish");
const policy = JSON.parse(await readFile(resolve(policyPathArg), "utf8"));

if (policy.version !== versionArg) {
  throw new Error(`Update policy ${policy.version} does not match release ${versionArg}`);
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "publish") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
}

function sourceGroup(path) {
  return relative(artifactRoot, path).split(sep)[0]?.toLowerCase() ?? "";
}

function one(files, predicate, label) {
  const matches = files.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected one ${label} updater artifact, found ${matches.length}: ${matches.map((path) => basename(path)).join(", ")}`);
  }
  return matches[0];
}

function signatureFor(files, artifact) {
  const signature = files.find((path) => path === `${artifact}.sig`);
  if (!signature) throw new Error(`Missing updater signature for ${artifact}`);
  return signature;
}

await mkdir(publishRoot, { recursive: true });
const files = await collectFiles(artifactRoot);
const windowsArtifact = one(files, (path) => sourceGroup(path).includes("windows") && path.toLowerCase().endsWith(".exe"), "Windows");
const windowsMsiArtifact = one(files, (path) => sourceGroup(path).includes("windows") && path.toLowerCase().endsWith(".msi"), "Windows MSI");
const macosArtifact = one(files, (path) => sourceGroup(path).includes("macos") && path.toLowerCase().endsWith(".app.tar.gz"), "macOS");
const linuxX64Artifact = one(files, (path) => sourceGroup(path).startsWith("linux-x64") && path.toLowerCase().endsWith(".appimage"), "Linux x64");
const linuxArm64Artifact = one(files, (path) => sourceGroup(path).startsWith("linux-arm64") && path.toLowerCase().endsWith(".appimage"), "Linux arm64");

async function publishArtifact(artifact, filename) {
  const signaturePath = signatureFor(files, artifact);
  await copyFile(artifact, join(publishRoot, filename));
  await copyFile(signaturePath, join(publishRoot, `${filename}.sig`));
  return {
    signature: (await readFile(signaturePath, "utf8")).trim(),
    url: `https://github.com/${repositoryArg}/releases/download/${tagArg}/${encodeURIComponent(filename)}`,
  };
}

const windows = await publishArtifact(windowsArtifact, `orbital-vision-${versionArg}-windows-x86_64-updater.exe`);
const windowsMsi = await publishArtifact(windowsMsiArtifact, `orbital-vision-${versionArg}-windows-x86_64-updater.msi`);
const macos = await publishArtifact(macosArtifact, `orbital-vision-${versionArg}-macos-universal-updater.tar.gz`);
const linuxX64 = await publishArtifact(linuxX64Artifact, `orbital-vision-${versionArg}-linux-x86_64-updater.AppImage`);
const linuxArm64 = await publishArtifact(linuxArm64Artifact, `orbital-vision-${versionArg}-linux-aarch64-updater.AppImage`);

const latest = {
  version: versionArg,
  notes: JSON.stringify(policy),
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64-nsis": windows,
    "windows-x86_64-msi": windowsMsi,
    "darwin-x86_64": macos,
    "darwin-aarch64": macos,
    "linux-x86_64": linuxX64,
    "linux-aarch64": linuxArm64,
  },
};

await writeFile(join(publishRoot, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
await writeFile(join(publishRoot, "update-policy.json"), `${JSON.stringify(policy, null, 2)}\n`, "utf8");
