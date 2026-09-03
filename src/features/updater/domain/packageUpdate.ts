import channel from "../../../../release/channel.json";
import { isSemanticVersion } from "@/shared/data/semver";

export interface UpdateCapability {
  automatic: boolean;
  packageKind: string;
  architecture: string;
  target: string;
}

export function manualPackageUrl(capability: UpdateCapability, version: string): string | null {
  if (!isSemanticVersion(version) || version.startsWith("v") || capability.automatic
    || !["deb", "rpm"].includes(capability.packageKind)
    || !["x86_64", "aarch64"].includes(capability.architecture)) return null;
  const filename = `orbital-vision-${version}-linux-${capability.architecture}-${capability.packageKind}.${capability.packageKind}`;
  return `https://github.com/${channel.repository}/releases/download/v${encodeURIComponent(version)}/${encodeURIComponent(filename)}`;
}
