import { readFileSync } from "node:fs";
import { isSemanticVersion } from "../src/shared/data/semverCore.mjs";

export const releaseRepository = JSON.parse(readFileSync(new URL("../release/channel.json", import.meta.url), "utf8")).repository;
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(releaseRepository)) throw new Error("Invalid public release repository");
export function assertReleaseChannel(repository, version, tag) {
  if (repository !== releaseRepository) throw new Error("Release destination differs from release/channel.json");
  if (version !== undefined && (!isSemanticVersion(version) || version.startsWith("v") || version.includes("+") || tag !== `v${version}`)) {
    throw new Error("Invalid release version or tag");
  }
}
