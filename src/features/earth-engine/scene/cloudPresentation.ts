export type CloudPresentation = "hidden" | "imagery" | "shell";

/** This is a visual shell clearance, not a meteorological cloud-height model. */
export function resolveCloudPresentation(
  previous: CloudPresentation,
  visible: boolean,
  shellAvailable: boolean,
  cameraHeightMeters: number,
): CloudPresentation {
  if (!visible) return "hidden";
  if (!shellAvailable || !Number.isFinite(cameraHeightMeters)) return "imagery";
  // Switch well before the camera can enter the 7.5 km shell. The separate
  // return threshold prevents flicker when a wheel gesture rests on the boundary.
  return cameraHeightMeters > (previous === "shell" ? 35_000 : 60_000)
    ? "shell"
    : "imagery";
}
