import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [outputPathArg, repositoryArg] = process.argv.slice(2);

if (!outputPathArg || !repositoryArg || !/^[^/]+\/[^/]+$/.test(repositoryArg)) {
  throw new Error("Usage: create-tauri-updater-config <output-path> <owner/repo>");
}

const publicKey = (await readFile(resolve("release/updater-public-key.txt"), "utf8")).trim();
if (!publicKey) throw new Error("Updater public key is empty");

const config = {
  bundle: {
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      endpoints: [`https://github.com/${repositoryArg}/releases/latest/download/latest.json`],
      pubkey: publicKey,
      windows: {
        installMode: "passive",
      },
    },
  },
};

if (process.env.WINDOWS_CERTIFICATE_THUMBPRINT) {
  config.bundle.windows = {
    certificateThumbprint: process.env.WINDOWS_CERTIFICATE_THUMBPRINT,
    digestAlgorithm: "sha256",
    timestampUrl: "http://timestamp.digicert.com",
  };
}

const outputPath = resolve(outputPathArg);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Wrote updater build configuration to ${outputPath}`);
