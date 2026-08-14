export type EarthFocusCloseTarget = "all" | "launch" | "satellite";

export interface EarthFocusLifecycle {
  launchLayer: {
    selectLaunch: (
      id: string | null,
      flyTo?: boolean,
      restoreCamera?: boolean,
    ) => void;
  } | null;
  returnToDefaultEarth: () => boolean;
  satelliteLayer: {
    selectSatellite: (id: string | null, restoreCamera?: boolean) => void;
    setFollowSelected: (enabled: boolean) => void;
  } | null;
}

/**
 * Closes a temporary Earth focus session in one deterministic order.
 * Selection layers are told not to start independent flights so Escape can
 * clear both layers and start exactly one Default Earth return.
 */
export function closeEarthFocusSession(
  lifecycle: EarthFocusLifecycle,
  target: EarthFocusCloseTarget,
): boolean {
  if (target === "all" || target === "satellite") {
    lifecycle.satelliteLayer?.setFollowSelected(false);
    lifecycle.satelliteLayer?.selectSatellite(null, false);
  }
  if (target === "all" || target === "launch") {
    lifecycle.launchLayer?.selectLaunch(null, false, false);
  }
  return lifecycle.returnToDefaultEarth();
}
