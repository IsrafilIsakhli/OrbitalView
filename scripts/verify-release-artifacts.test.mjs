import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyReleaseArtifacts } from "./verify-release-artifacts.mjs";
import { releaseRepository } from "./release-channel.mjs";

async function fixture() {
  // Small synthetic artifacts only in the OS temp directory, never in production bundles.
  const root = await mkdtemp(join(tmpdir(), "orbital-release-test-"));
  const version = "0.1.2", tag = `v${version}`;
  const url = (filename) => `https://github.com/${releaseRepository}/releases/download/${tag}/${encodeURIComponent(filename)}`;
  const installers = [], platforms = {};
  for (const [platform, architecture, format, extension] of [
    ["windows", "x86_64", "nsis", "exe"], ["windows", "x86_64", "msi", "msi"], ["macos", "universal", "dmg", "dmg"],
    ...["x86_64", "aarch64"].flatMap((arch) => [["linux", arch, "appimage", "AppImage"], ["linux", arch, "deb", "deb"], ["linux", arch, "rpm", "rpm"]]),
  ]) {
    const filename = `orbital-vision-${version}-${platform}-${architecture}-${format}.${extension}`;
    const contents = Buffer.from(`TEST ONLY ${filename}`);
    await writeFile(join(root, filename), contents);
    installers.push({ platform, architecture, format, filename, sizeBytes: contents.length,
      sha256: createHash("sha256").update(contents).digest("hex"), downloadUrl: url(filename), trust: { mode: "test", requiresManualSecurityApproval: true } });
    if (["nsis", "msi", "appimage"].includes(format)) {
      await writeFile(join(root, `${filename}.sig`), "dGVzdA==\n");
      const target = platform === "windows" ? `windows-${architecture}-${format}` : `linux-${architecture}`;
      platforms[target] = { signature: "dGVzdA==", url: url(filename) };
    }
  }
  const mac = `orbital-vision-${version}-macos-universal.app.tar.gz`;
  await writeFile(join(root, mac), "TEST ONLY"); await writeFile(join(root, `${mac}.sig`), "dGVzdA==");
  for (const arch of ["x86_64", "aarch64"]) platforms[`darwin-${arch}`] = { signature: "dGVzdA==", url: url(mac) };
  const manifest = { schemaVersion: 1, product: "Orbital Vision", version, tag, publishedAt: "2026-09-04T00:00:00Z", installers };
  await writeFile(join(root, "release-manifest.json"), JSON.stringify(manifest));
  await writeFile(join(root, "latest.json"), JSON.stringify({ version, platforms }));
  return { root, manifest };
}
test("validates all nine packages and emits complete checksums", async () => {
  const { root } = await fixture(); const result = await verifyReleaseArtifacts(root);
  assert.equal(result.installers, 9);
  assert.match(await readFile(join(root, "SHA256SUMS.txt"), "utf8"), /latest\.json/);
});
test("rejects tampered binaries", async () => {
  const { root, manifest } = await fixture(); await writeFile(join(root, manifest.installers[0].filename), "tampered");
  await assert.rejects(verifyReleaseArtifacts(root), /Checksum mismatch/);
});
test("rejects absent architectures rather than publishing partial downloads", async () => {
  const { root, manifest } = await fixture(); manifest.installers.pop();
  await writeFile(join(root, "release-manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyReleaseArtifacts(root), /Missing installer platforms/);
});
test("refuses source or secret files in the public upload directory", async () => {
  const { root } = await fixture(); await writeFile(join(root, "source.ts"), "TEST ONLY");
  await assert.rejects(verifyReleaseArtifacts(root), /Unexpected public artifact/);
});
test("rejects repository redirects embedded in installer URLs", async () => {
  const { root, manifest } = await fixture(); manifest.installers[0].downloadUrl = "https://example.invalid/binary.exe";
  await writeFile(join(root, "release-manifest.json"), JSON.stringify(manifest));
  await assert.rejects(verifyReleaseArtifacts(root), /Unsafe or mismatched artifact URL/);
});
