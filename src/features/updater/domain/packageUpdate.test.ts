import { expect, it } from "vitest";
import { manualPackageUrl } from "./packageUpdate";

it("uses matching architecture and package, never an EXE or AppImage fallback", () => {
  const capability = { automatic: false, packageKind: "rpm", architecture: "aarch64", target: "linux-aarch64" };
  expect(manualPackageUrl(capability, "0.1.2")).toBe("https://github.com/IsrafilIsakhli/OrbitalVision-Releases/releases/download/v0.1.2/orbital-vision-0.1.2-linux-aarch64-rpm.rpm");
  expect(manualPackageUrl({ ...capability, packageKind: "unknown" }, "0.1.2")).toBeNull();
  expect(manualPackageUrl(capability, "../../bad")).toBeNull();
  expect(manualPackageUrl({ ...capability, automatic: true }, "0.1.2")).toBeNull();
});
