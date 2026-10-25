import {
  BoundingSphere,
  Cartesian3,
  Clock,
  HeadingPitchRange,
  Math as CesiumMath,
  type Camera,
  type Scene,
} from "cesium";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

import {
  CesiumCameraController,
  earthRangeForComposition,
} from "./CesiumCameraController";

function createController() {
  const addEventListener = vi.fn();
  const cameraMocks = {
    cancelFlight: vi.fn<Camera["cancelFlight"]>(),
    flyTo: vi.fn<Camera["flyTo"]>(),
    flyToBoundingSphere: vi.fn<Camera["flyToBoundingSphere"]>(),
    lookAtTransform: vi.fn<Camera["lookAtTransform"]>(),
    moveRight: vi.fn<Camera["moveRight"]>(),
    moveUp: vi.fn<Camera["moveUp"]>(),
  };
  const camera = {
    ...cameraMocks,
    frustum: { fovy: CesiumMath.toRadians(60) },
    positionCartographic: { height: 2_000_000 },
  } as unknown as Camera;
  const scene = {
    requestRender: vi.fn(),
    screenSpaceCameraController: {},
  } as unknown as Scene;
  const canvas = {
    addEventListener,
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
  return { addEventListener, cameraMocks, canvas, controller, onPresetChanged };
}

describe("Earth camera composition", () => {
  it("composes overlays with the frustum while keeping the camera pointed at Earth's centre", () => {
    const { controller, cameraMocks } = createController();
    controller.setCompositionInsets({ left: 12, right: 420, top: 12, bottom: 118 });
    controller.setDefaultCompositionInsets({ left: 12, right: 12, top: 12, bottom: 118 });
    controller.flyTo("earth", true);
    const flight = cameraMocks.flyTo.mock.calls[0]![0];
    const direction = (flight.orientation as { direction: Cartesian3 }).direction;
    const toCenter = Cartesian3.normalize(Cartesian3.negate(flight.destination as Cartesian3, new Cartesian3()), new Cartesian3());
    expect(Cartesian3.dot(direction, toCenter)).toBeCloseTo(1, 12);
    expect(cameraMocks.moveUp).not.toHaveBeenCalled();
    expect(cameraMocks.moveRight).not.toHaveBeenCalled();
    controller.dispose();
  });
  it("keeps a finite cinematic range across target viewport sizes", () => {
    for (const height of [568, 680, 900, 1_080, 1_440, 2_160]) {
      const range = earthRangeForComposition(
        6_378_137,
        Math.PI / 3,
        height,
        height >= 900 ? 0.72 : 0.66,
        { bottom: 96, left: 320, right: 380, top: 96 },
        height * 16 / 9,
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
  it("never resumes automatic rotation while an object owns the camera", () => {
    const { controller } = createController();
    controller.beginObjectFocus();
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000_000_000);
    expect(controller.isAutoRotating()).toBe(false);
    controller.flyTo("earth", true);
    now.mockReturnValue(1_000_020_000);
    expect(controller.isAutoRotating()).toBe(true);
    now.mockRestore(); controller.dispose();
  });
  it("manual wheel input cancels both pending return and current flight", () => {
    const { addEventListener, cameraMocks, controller } = createController();
    controller.flyTo("earth", true);
    controller.returnToDefaultEarth();
    cameraMocks.flyTo.mockClear(); cameraMocks.cancelFlight.mockClear();
    const handler = addEventListener.mock.calls.find(([type])=>type === "wheel")?.[1] as EventListener;
    handler(new Event("wheel"));
    vi.advanceTimersByTime(50);
    expect(cameraMocks.flyTo).not.toHaveBeenCalled();
    expect(cameraMocks.cancelFlight).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
  it("coalesces repeated close requests and never resets a manual camera on drawer changes", () => {
    const { cameraMocks, controller } = createController();
    controller.flyTo("earth", true);
    cameraMocks.flyTo.mockClear();
    controller.setCompositionInsets({ top: 100, bottom: 90, left: 0, right: 352 });
    controller.setDefaultCompositionInsets({ top: 100, bottom: 90, left: 0, right: 352 });
    expect(cameraMocks.flyTo).not.toHaveBeenCalled();
    controller.returnToDefaultEarth(); controller.returnToDefaultEarth(); controller.returnToDefaultEarth();
    vi.advanceTimersByTime(40);
    expect(cameraMocks.flyTo).toHaveBeenCalledTimes(1);
    controller.returnToDefaultEarth(); controller.dispose();
    vi.advanceTimersByTime(40);
    expect(cameraMocks.flyTo).toHaveBeenCalledTimes(1);
  });
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
    vi.advanceTimersByTime(40);

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
    vi.advanceTimersByTime(40);
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
    vi.advanceTimersByTime(40);

    expect(cameraMocks.flyTo.mock.calls[
      cameraMocks.flyTo.mock.calls.length - 1
    ]?.[0].duration).toBe(0);
  });

  it("routes Home through the shared focus-close lifecycle", () => {
    const { addEventListener, cameraMocks, controller } = createController();
    const closeFocus = vi.fn(() => true);
    controller.setDefaultEarthRequestHandler(closeFocus);
    const handler = addEventListener.mock.calls.find(([type]) => type === "keydown")?.[1] as EventListener;

    handler(new KeyboardEvent("keydown", { key: "Home" }));

    expect(closeFocus).toHaveBeenCalledOnce();
    expect(cameraMocks.flyTo).not.toHaveBeenCalled();
    controller.dispose();
  });
});
