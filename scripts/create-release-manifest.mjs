import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";

const [artifactRootArg, versionArg, repositoryArg, tagArg] = process.argv.slice(2);

if (!artifactRootArg || !versionArg || !repositoryArg || !tagArg) {
  throw new Error(
    "Usage: create-release-manifest <artifact-root> <version> <owner/repo> <tag>",
  );
}

const artifactRoot = resolve(artifactRootArg);
const publishRoot = join(artifactRoot, "publish");
const allowedExtensions = new Set([".appimage", ".deb", ".dmg", ".exe", ".msi", ".rpm"]);
const windowsTrust = process.env.RELEASE_WINDOWS_TRUST ?? "unsigned";
const macosTrust = process.env.RELEASE_MACOS_TRUST ?? "ad-hoc";

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "publish") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (allowedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
  }

  return files;
}

function platformMetadata(path) {
  const parts = relative(artifactRoot, path).split(sep);
  const source = parts[0]?.toLowerCase() ?? "";
  const filename = basename(path).toLowerCase();
  const extension = extname(filename);

  if (source.includes("windows")) return { platform: "windows", architecture: "x86_64" };
  if (source.includes("macos")) return { platform: "macos", architecture: "universal" };
  if (source.includes("linux-arm64")) return { platform: "linux", architecture: "aarch64" };
  if (source.includes("linux")) return { platform: "linux", architecture: "x86_64" };
  if (extension === ".exe" || extension === ".msi") {
    return { platform: "windows", architecture: "x86_64" };
  }
  if (extension === ".dmg") return { platform: "macos", architecture: "universal" };
  if ([".appimage", ".deb", ".rpm"].includes(extension)) {
    return {
      platform: "linux",
      architecture: /(?:aarch64|arm64)/.test(filename) ? "aarch64" : "x86_64",
    };
  }
  throw new Error(`Cannot infer platform from artifact path: ${path}`);
}

function installerFormat(filename) {
  const extension = extname(filename).toLowerCase();
  if (extension === ".exe") return "nsis";
  if (extension === ".msi") return "msi";
  if (extension === ".dmg") return "dmg";
  if (extension === ".appimage") return "appimage";
  return extension.slice(1);
}

function trustMetadata(platform) {
  if (platform === "windows") {
    return {
      mode: windowsTrust,
      requiresManualSecurityApproval: windowsTrust !== "authenticode",
    };
  }
  if (platform === "macos") {
    return {
      mode: macosTrust,
      requiresManualSecurityApproval: macosTrust !== "notarized",
    };
  }
  return {
    mode: "sha256",
    requiresManualSecurityApproval: false,
  };
}

await mkdir(publishRoot, { recursive: true });
const sourceFiles = await collectFiles(artifactRoot);
const seenNames = new Set();
const installers = [];

for (const sourcePath of sourceFiles.sort()) {
  const { platform, architecture } = platformMetadata(sourcePath);
  const format = installerFormat(sourcePath);
  const sourceExtension = extname(sourcePath);
  const filename = `orbital-vision-${versionArg}-${platform}-${architecture}-${format}${sourceExtension}`;
  if (seenNames.has(filename)) throw new Error(`Duplicate release filename: ${filename}`);
  seenNames.add(filename);

  const content = await readFile(sourcePath);
  const sha256 = createHash("sha256").update(content).digest("hex");
  await copyFile(sourcePath, join(publishRoot, filename));

  installers.push({
    platform,
    architecture,
    format,
    filename,
    sha256,
    trust: trustMetadata(platform),
    downloadUrl: `https://github.com/${repositoryArg}/releases/download/${tagArg}/${encodeURIComponent(filename)}`,
  });
}

if (installers.length === 0) throw new Error("No desktop installers were found");

const manifest = {
  schemaVersion: 1,
  product: "Orbital Vision",
  version: versionArg,
  tag: tagArg,
  publishedAt: new Date().toISOString(),
  installers,
};

await writeFile(
  join(publishRoot, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
await writeFile(
  join(publishRoot, "SHA256SUMS.txt"),
  `${installers.map((item) => `${item.sha256}  ${item.filename}`).join("\n")}\n`,
  "utf8",
);
