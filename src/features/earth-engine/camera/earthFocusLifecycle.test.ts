import { describe, expect, it, vi } from "vitest";

import { closeEarthFocusSession } from "./earthFocusLifecycle";

function createLifecycle() {
  const calls: string[] = [];
  return {
    calls,
    lifecycle: {
      launchLayer: {
        selectLaunch: vi.fn(() => calls.push("clear-launch")),
      },
      returnToDefaultEarth: vi.fn(() => {
        calls.push("default-earth");
        return true;
      }),
      satelliteLayer: {
        selectSatellite: vi.fn(() => calls.push("clear-satellite")),
        setFollowSelected: vi.fn(() => calls.push("stop-follow")),
      },
    },
  };
}

describe("Earth focus close lifecycle", () => {
  it("uses the follow-stop, clear-target, restore order for satellite X", () => {
    const { calls, lifecycle } = createLifecycle();

    closeEarthFocusSession(lifecycle, "satellite");

    expect(calls).toEqual([
      "stop-follow",
      "clear-satellite",
      "default-earth",
    ]);
    expect(lifecycle.satelliteLayer.selectSatellite).toHaveBeenCalledWith(null, false);
  });

  it("uses the same single restoration for Escape across both object types", () => {
    const { calls, lifecycle } = createLifecycle();

    closeEarthFocusSession(lifecycle, "all");

    expect(calls).toEqual([
      "stop-follow",
      "clear-satellite",
      "clear-launch",
      "default-earth",
    ]);
    expect(lifecycle.launchLayer.selectLaunch).toHaveBeenCalledWith(null, false, false);
    expect(lifecycle.returnToDefaultEarth).toHaveBeenCalledOnce();
  });

  it("restores launch X without touching the satellite follow loop", () => {
    const { calls, lifecycle } = createLifecycle();

    closeEarthFocusSession(lifecycle, "launch");

    expect(calls).toEqual(["clear-launch", "default-earth"]);
    expect(lifecycle.satelliteLayer.setFollowSelected).not.toHaveBeenCalled();
  });
});
