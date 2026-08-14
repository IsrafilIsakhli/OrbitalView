import {
  BoundingSphere,
  Cartesian3,
  Clock,
  HeadingPitchRange,
  Math as CesiumMath,
  type Camera,
  type Scene,
} from "cesium";
import { describe, expect, it, vi } from "vitest";

import {
  CesiumCameraController,
  earthRangeForComposition,
} from "./CesiumCameraController";

function createController() {
  const cameraMocks = {
    cancelFlight: vi.fn<Camera["cancelFlight"]>(),
    flyTo: vi.fn<Camera["flyTo"]>(),
    flyToBoundingSphere: vi.fn<Camera["flyToBoundingSphere"]>(),
    lookAtTransform: vi.fn<Camera["lookAtTransform"]>(),
  };
  const camera = {
    ...cameraMocks,
    frustum: { fovy: CesiumMath.toRadians(60) },
  } as unknown as Camera;
  const scene = {
    requestRender: vi.fn(),
    screenSpaceCameraController: {},
  } as unknown as Scene;
  const canvas = {
    addEventListener: vi.fn(),
    clientHeight: 900,
    clientWidth: 1_440,
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;
  const onPresetChanged = vi.fn();
  const controller = new CesiumCameraController(
    scene,
    camera,
    canvas,
    new Clock(),
    onPresetChanged,
  );
  return { cameraMocks, canvas, controller, onPresetChanged };
}

describe("Earth camera composition", () => {
  it("keeps a finite cinematic range across target viewport sizes", () => {
    for (const height of [568, 680, 900, 1_080, 1_440, 2_160]) {
      const range = earthRangeForComposition(
        6_378_137,
        Math.PI / 3,
        height,
        height >= 900 ? 0.72 : 0.66,
        { bottom: 96, left: 320, right: 380, top: 96 },
      );
      expect(Number.isFinite(range)).toBe(true);
      expect(range).toBeGreaterThan(6_378_137);
      expect(range).toBeLessThan(40_000_000);
    }
  });

  it("backs the camera away when HUD insets reduce the safe viewport", () => {
    const open = earthRangeForComposition(
      6_378_137,
      Math.PI / 3,
      1_080,
      0.72,
      { bottom: 0, left: 0, right: 0, top: 0 },
    );
    const constrained = earthRangeForComposition(
      6_378_137,
      Math.PI / 3,
      1_080,
      0.72,
      { bottom: 120, left: 320, right: 460, top: 120 },
    );
    expect(constrained).toBeGreaterThan(open);
  });
});

describe("Default Earth camera lifecycle", () => {
  it("returns to the stable Default Earth view after object focus", () => {
    const { cameraMocks, controller, onPresetChanged } = createController();
    controller.setDefaultCompositionInsets({ bottom: 96, left: 320, right: 380, top: 96 });
    controller.flyTo("earth", true);
    const initialFlight = cameraMocks.flyTo.mock.calls[0]?.[0];

    controller.focusBoundingSphere(
      new BoundingSphere(new Cartesian3(1, 2, 3), 10),
      {
        duration: 1,
        offset: new HeadingPitchRange(0, -0.4, 800_000),
      },
    );
    expect(controller.returnToDefaultEarth()).toBe(true);

    const returnFlight = cameraMocks.flyTo.mock.calls[
      cameraMocks.flyTo.mock.calls.length - 1
    ]?.[0];
    expect(returnFlight?.destination).toEqual(initialFlight?.destination);
    expect(returnFlight?.orientation).toEqual(initialFlight?.orientation);
    expect(cameraMocks.cancelFlight).toHaveBeenCalled();
    expect(onPresetChanged).toHaveBeenLastCalledWith("earth");
  });

  it("recomputes Default Earth when the measured safe area changes", () => {
    const { cameraMocks, controller } = createController();
    controller.flyTo("earth", true);
    const openDestination = cameraMocks.flyTo.mock.calls[0]?.[0].destination as Cartesian3;

    controller.setDefaultCompositionInsets({ bottom: 180, left: 320, right: 460, top: 180 });
    controller.returnToDefaultEarth();
    const constrainedDestination = cameraMocks.flyTo.mock.calls[
      cameraMocks.flyTo.mock.calls.length - 1
    ]?.[0].destination as Cartesian3;

    expect(Cartesian3.magnitude(constrainedDestination)).toBeGreaterThan(
      Cartesian3.magnitude(openDestination),
    );
  });

  it("uses a zero-duration Default Earth return with reduced motion", () => {
    const { cameraMocks, controller } = createController();
    controller.flyTo("earth", true);
    controller.setReducedMotion(true);
    controller.returnToDefaultEarth();

    expect(cameraMocks.flyTo.mock.calls[
      cameraMocks.flyTo.mock.calls.length - 1
    ]?.[0].duration).toBe(0);
  });
});
