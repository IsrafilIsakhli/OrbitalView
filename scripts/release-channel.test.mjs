import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertReleaseChannel, releaseRepository } from "./release-channel.mjs";

test("private source repository and malformed release cannot become the download channel", () => {
  assert.throws(() => assertReleaseChannel("IsrafilIsakhli/OrbitalView", "0.1.2", "v0.1.2"));
  assert.throws(() => assertReleaseChannel(releaseRepository, "0.1.2", "v0.1.1"));
  assert.throws(() => assertReleaseChannel(releaseRepository, "../bad", "v../bad"));
});

test("app configuration, version and public key match the release source of truth", async () => {
  const config = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
  const publicKey = (await readFile("release/updater-public-key.txt", "utf8")).trim();
  assert.equal(config.version, pkg.version);
  assert.equal(cargo.match(/^version = "([^"]+)"/m)[1], pkg.version);
  assert.equal(config.plugins.updater.pubkey, publicKey);
  assert.deepEqual(config.plugins.updater.endpoints, [`https://github.com/${releaseRepository}/releases/latest/download/latest.json`]);
});
