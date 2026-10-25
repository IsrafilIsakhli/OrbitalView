import {
  type BoundingSphere,
  Cartesian3,
  Cartographic,
  type Clock,
  EasingFunction,
  HeadingPitchRange,
  Matrix3,
  Matrix4,
  Math as CesiumMath,
  Simon1994PlanetaryPositions,
  Transforms,
  type Camera,
  type Scene,
} from "cesium";

import type {
  CameraCompositionInsets,
  CameraPresetId,
} from "../contracts/earth-engine";
import { cameraPresets } from "./cameraPresets";
import { EARTH_MAXIMUM_ZOOM_METERS, StableCameraZoom } from "./StableCameraZoom";
import { CelestialCameraFrame, celestialRadii, type CelestialBody } from "./CelestialCameraFrame";

const INTERACTION_PAUSE_MS = 10_000;
const CINEMATIC_ROTATION_RADIANS_PER_SECOND = 0.00062;
const MINIMUM_ROTATION_HEIGHT_METERS = 1_150_000;
const EARTH_RADIUS_METERS = 6_378_137;

const inertialPositionScratch = new Cartesian3();
const fixedPositionScratch = new Cartesian3();
const transformScratch = new Matrix3();
const earthDestinationScratch = new Cartesian3();
const earthDirectionScratch = new Cartesian3();
const earthRightScratch = new Cartesian3();
const earthUpScratch = new Cartesian3();

interface EarthViewpoint {
  latitudeDegrees: number;
  longitudeDegrees: number;
}

interface DefaultEarthCameraState {
  readonly destination: Cartesian3;
  readonly direction: Cartesian3;
  readonly insets: CameraCompositionInsets;
  readonly up: Cartesian3;
  readonly viewportAspect: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

export interface FocusBoundingSphereOptions {
  complete?: () => void;
  duration: number;
  offset: HeadingPitchRange;
}

export class CesiumCameraController {
  private readonly zoomController: StableCameraZoom;
  private readonly celestialFrame = new CelestialCameraFrame();
  private celestialLayout = "";
  private autoRotation = true;
  private objectFocusActive = false;
  private activePreset: CameraPresetId = "earth";
  private lastInteractionAt = Number.NEGATIVE_INFINITY;
  private reducedMotion = false;
  private defaultEarthState: DefaultEarthCameraState | null = null;
  private defaultEarthViewpoint: EarthViewpoint | null = null;
  private returnFrame: number | null = null;
  private defaultEarthRequestHandler: (() => boolean) | null = null;
  private defaultCompositionInsets: CameraCompositionInsets = {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  };
  private compositionInsets: CameraCompositionInsets = {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  };

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly clock: Clock,
    private readonly onPresetChanged: (preset: CameraPresetId) => void,
  ) {
    const controller = this.scene.screenSpaceCameraController;
    controller.enableInputs = true;
    controller.enableRotate = true;
    controller.enableTilt = true;
    controller.enableZoom = true;
    controller.enableLook = false;
    controller.maximumTiltAngle = Math.PI / 2;
    controller.enableCollisionDetection = true;
    controller.inertiaSpin = 0.7;
    controller.inertiaTranslate = 0.65;
    controller.inertiaZoom = 0.35;
    controller.maximumMovementRatio = 0.08;
    controller.minimumZoomDistance = 900;
    controller.maximumZoomDistance = EARTH_MAXIMUM_ZOOM_METERS;
    controller.zoomFactor = 2.5;

    canvas.addEventListener("pointerdown", this.handleManualInput, {
      passive: true,
    });
    canvas.addEventListener("touchstart", this.handleManualInput, {
      passive: true,
    });
    canvas.addEventListener("wheel", this.handleManualInput, { passive: true });
    canvas.addEventListener("keydown", this.handleKeyDown);
    this.zoomController = new StableCameraZoom(scene, camera, canvas);
  }

  flyTo(presetId: CameraPresetId, immediate = false): void {
    const fromCelestial = this.isCelestialView();
    this.celestialFrame.clear();
    this.cancelPendingReturn();
    this.objectFocusActive = false;
    const preset = cameraPresets[presetId];
    this.markInteraction();
    this.activePreset = presetId;
    this.configureZoom(presetId === "moon" || presetId === "sun" ? presetId : null);
    this.onPresetChanged(presetId);
    this.camera.cancelFlight();
    this.camera.lookAtTransform(Matrix4.IDENTITY);

    if (presetId === "moon" || presetId === "sun") {
      this.flyToCelestialBody(presetId);
      return;
    }

    if (presetId === "earth") {
      this.defaultEarthViewpoint = this.daylightEarthViewpoint();
      this.refreshDefaultEarthState();
      this.flyToDefaultEarth(immediate || fromCelestial);
      return;
    }
    const daylight = this.daylightEarthViewpoint();
    const destination = Cartesian3.fromDegrees(
      daylight.longitudeDegrees,
      daylight.latitudeDegrees,
      preset.heightMeters,
    );
    this.camera.flyTo({
      destination,
      duration:
        immediate || this.reducedMotion || fromCelestial ? 0 : preset.durationSeconds,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      orientation: {
        heading: CesiumMath.toRadians(preset.headingDegrees),
        pitch: CesiumMath.toRadians(preset.pitchDegrees),
        roll: 0,
      },
    });
  }

  focusBoundingSphere(
    boundingSphere: BoundingSphere,
    options: FocusBoundingSphereOptions,
  ): void {
    this.cancelPendingReturn();
    this.objectFocusActive = true;
    this.celestialFrame.clear();
    this.configureZoom(null);
    this.activePreset = "earth";
    this.onPresetChanged("earth");
    this.markInteraction();
    this.camera.cancelFlight();
    this.camera.lookAtTransform(Matrix4.IDENTITY);
    const safeWidth = Math.max(
      1,
      this.canvas.clientWidth - this.compositionInsets.left - this.compositionInsets.right,
    );
    const safeHeight = Math.max(128, this.canvas.clientHeight - this.compositionInsets.top - this.compositionInsets.bottom);
    const safeAreaScale = Math.max(1, this.canvas.clientWidth / Math.max(128, safeWidth), this.canvas.clientHeight / safeHeight);
    const range = options.offset.range * safeAreaScale;
    this.camera.flyToBoundingSphere(boundingSphere, {
      complete: () => {
        this.alignFocusedTarget();
        options.complete?.();
      },
      duration: this.reducedMotion ? 0 : options.duration,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      offset: new HeadingPitchRange(
        options.offset.heading,
        options.offset.pitch,
        range,
      ),
    });
  }

  returnToDefaultEarth(): boolean {
    const fromCelestial = this.isCelestialView();
    this.celestialFrame.clear();
    this.configureZoom(null);
    this.objectFocusActive = false;
    if (this.defaultEarthState === null) {
      this.defaultEarthViewpoint ??= this.daylightEarthViewpoint();
      this.refreshDefaultEarthState();
    }
    if (this.defaultEarthState === null) return false;
    this.cancelPendingReturn();
    this.markInteraction();
    this.activePreset = "earth";
    this.onPresetChanged("earth");
    this.camera.cancelFlight();
    // Coalesce X/Escape/hide. React commits the inspector removal, then the
    // ResizeObserver supplies default overlay bounds before this single flight.
    this.returnFrame = requestAnimationFrame(() => {
      this.returnFrame = requestAnimationFrame(() => {
        this.returnFrame = null;
        this.refreshDefaultEarthState();
        this.camera.lookAtTransform(Matrix4.IDENTITY);
        this.flyToDefaultEarth(this.reducedMotion || fromCelestial);
      });
    });
    return true;
  }

  setDefaultEarthRequestHandler(handler: (() => boolean) | null): void {
    this.defaultEarthRequestHandler = handler;
  }

  /** Pause cinematic auto-rotation after UI-driven focus/follow actions that
   *  do not originate on the canvas (toolbar buttons, inspector toggles). */
  noteUserActivity(): void {
    this.markInteraction();
  }

  /** Selection/follow owns the camera until an explicit preset or close. */
  beginObjectFocus(): void {
    this.celestialFrame.clear();
    this.configureZoom(null);
    this.activePreset = "earth";
    this.onPresetChanged("earth");
    this.objectFocusActive = true;
    this.cancelPendingReturn();
    this.camera.cancelFlight();
    this.markInteraction();
    this.scene.requestRender();
  }

  setAutoRotation(enabled: boolean): void {
    this.autoRotation = enabled;
  }

  /** Call after lookAt/focus, never after a free manual camera movement. */
  alignFocusedTarget(): void {
    const frustum = this.camera.frustum as { fovy?: number; near?: number; xOffset?: number; yOffset?: number };
    const nearPerPixel = (frustum.near ?? 1) * Math.tan((frustum.fovy ?? Math.PI / 3) / 2)
      / Math.max(1, this.canvas.clientHeight);
    const { left, right, top, bottom } = this.compositionInsets;
    // Off-axis projection composes the HUD without moving the physical camera.
    // A translated near-nadir pose loses its offset in Cesium's HPR conversion,
    // causing a visible jump at the end of a default/focus flight.
    frustum.xOffset = (right - left) * nearPerPixel;
    frustum.yOffset = (top - bottom) * nearPerPixel;
    this.scene.requestRender();
  }

  setCompositionInsets(insets: CameraCompositionInsets): void {
    this.compositionInsets = normalizeInsets(insets);
    this.alignFocusedTarget();
  }

  setDefaultCompositionInsets(insets: CameraCompositionInsets): void {
    this.defaultCompositionInsets = normalizeInsets(insets);
    if (this.defaultEarthViewpoint !== null) this.refreshDefaultEarthState();
    if (this.isCelestialView() && this.celestialLayout !== this.celestialLayoutKey()) {
      this.flyToCelestialBody(this.activePreset as CelestialBody);
    }
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  tick(deltaSeconds: number): void {
    if (this.isCelestialView()) this.celestialFrame.update(this.camera, this.clock.currentTime);
    this.zoomController.tick(deltaSeconds);
    if (!this.isAutoRotating()) return;

    this.camera.rotate(
      Cartesian3.UNIT_Z,
      -CINEMATIC_ROTATION_RADIANS_PER_SECOND * deltaSeconds,
    );
  }

  isAutoRotating(): boolean {
    return this.autoRotation && !this.objectFocusActive && !this.reducedMotion && this.activePreset !== "moon" &&
      this.activePreset !== "sun" && performance.now() - this.lastInteractionAt >= INTERACTION_PAUSE_MS &&
      this.camera.positionCartographic.height >= MINIMUM_ROTATION_HEIGHT_METERS;
  }

  isCelestialView(): boolean { return this.activePreset === "moon" || this.activePreset === "sun"; }

  dispose(): void {
    this.zoomController.dispose();
    this.cancelPendingReturn();
    this.camera.cancelFlight();
    this.defaultEarthState = null;
    this.canvas.removeEventListener("pointerdown", this.handleManualInput);
    this.canvas.removeEventListener("touchstart", this.handleManualInput);
    this.canvas.removeEventListener("wheel", this.handleManualInput);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
  }

  private cancelPendingReturn(): void {
    if (this.returnFrame !== null) cancelAnimationFrame(this.returnFrame);
    this.returnFrame = null;
  }

  private readonly markInteraction = (): void => {
    this.lastInteractionAt = performance.now();
  };

  private readonly handleManualInput = (event: Event): void => {
    if (event.type !== "wheel") this.zoomController.cancel();
    this.cancelPendingReturn();
    this.camera.cancelFlight();
    this.markInteraction();
    this.scene.requestRender();
  };

  zoom(direction: "in" | "out"): void {
    this.cancelPendingReturn();
    this.camera.cancelFlight();
    this.markInteraction();
    this.zoomController.zoom(direction);
  }

  cancelZoom(): void { this.zoomController.cancel(); }
  isZooming(): boolean { return this.zoomController.moving; }

  private configureZoom(body: CelestialBody | null): void {
    const radius = body === null ? null : celestialRadii[body];
    this.zoomController.setCelestialRadius(radius);
    const controls = this.scene.screenSpaceCameraController;
    controls.enableCollisionDetection = body === null;
    controls.minimumZoomDistance = radius === null ? 900 : radius * 1.12;
    controls.maximumZoomDistance = radius === null ? EARTH_MAXIMUM_ZOOM_METERS : radius * 30;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      this.zoom(event.key === "-" ? "out" : "in");
    } else if (event.key === "Home") {
      event.preventDefault();
      if (!this.defaultEarthRequestHandler?.()) this.returnToDefaultEarth();
    }
  };

  private daylightEarthViewpoint(): EarthViewpoint {
    const inertialPosition =
      Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
        this.clock.currentTime,
        inertialPositionScratch,
      );
    const inertialToFixed =
      Transforms.computeIcrfToFixedMatrix(this.clock.currentTime, transformScratch)
      ?? Transforms.computeTemeToPseudoFixedMatrix(
        this.clock.currentTime,
        transformScratch,
      );
    const fixedPosition = Matrix3.multiplyByVector(
      inertialToFixed,
      inertialPosition,
      fixedPositionScratch,
    );
    const sun = Cartographic.fromCartesian(fixedPosition);
    const longitudeDegrees = CesiumMath.negativePiToPi(
      sun.longitude + CesiumMath.toRadians(38),
    );
    const latitudeDegrees = CesiumMath.clamp(
      CesiumMath.toDegrees(sun.latitude) + 6,
      -15,
      24,
    );
    return {
      latitudeDegrees,
      longitudeDegrees: CesiumMath.toDegrees(longitudeDegrees),
    };
  }

  private refreshDefaultEarthState(): void {
    const viewpoint = this.defaultEarthViewpoint;
    if (viewpoint === null) return;
    const frustum = this.camera.frustum as { fovy?: number };
    const verticalFov = frustum.fovy ?? CesiumMath.toRadians(60);
    const configuredOccupancy = cameraPresets.earth.targetEarthOccupancy ?? 0.72;
    const occupancy = configuredOccupancy;
    const range = earthRangeForComposition(
      EARTH_RADIUS_METERS,
      verticalFov,
      this.canvas.clientHeight,
      occupancy,
      this.defaultCompositionInsets,
      this.canvas.clientWidth,
    );
    const destination = Cartesian3.fromDegrees(
      viewpoint.longitudeDegrees,
      viewpoint.latitudeDegrees,
      Math.max(1_000, range - EARTH_RADIUS_METERS),
      undefined,
      earthDestinationScratch,
    );
    const direction = Cartesian3.normalize(
      Cartesian3.negate(destination, earthDirectionScratch),
      earthDirectionScratch,
    );
    const upReference = Math.abs(Cartesian3.dot(direction, Cartesian3.UNIT_Z)) > 0.92
      ? Cartesian3.UNIT_Y
      : Cartesian3.UNIT_Z;
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, upReference, earthRightScratch),
      earthRightScratch,
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, direction, earthUpScratch),
      earthUpScratch,
    );
    this.defaultEarthState = {
      destination: Cartesian3.clone(destination),
      direction: Cartesian3.clone(direction),
      insets: { ...this.defaultCompositionInsets },
      up: Cartesian3.clone(up),
      viewportAspect: this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight),
      viewportHeight: this.canvas.clientHeight,
      viewportWidth: this.canvas.clientWidth,
    };
  }

  private flyToDefaultEarth(immediate: boolean): void {
    const state = this.defaultEarthState;
    if (state === null) return;
    this.camera.flyTo({
      destination: Cartesian3.clone(state.destination),
      duration: immediate || this.reducedMotion ? 0 : cameraPresets.earth.durationSeconds,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      orientation: {
        direction: Cartesian3.clone(state.direction),
        up: Cartesian3.clone(state.up),
      },
    });
  }

  private flyToCelestialBody(body: CelestialBody): void {
    this.celestialLayout = this.celestialLayoutKey();
    const range = earthRangeForComposition(
      celestialRadii[body],
      (this.camera.frustum as { fovy?: number }).fovy ?? Math.PI / 3,
      this.canvas.clientHeight,
      body === "moon" ? 0.8 : 0.68,
      this.defaultCompositionInsets,
      this.canvas.clientWidth,
    );
    // A multi-million-kilometre Earth flyTo path crosses unrelated geometry and
    // invalidates surface tiles. Bind directly to the real body's local frame.
    this.celestialFrame.begin(body, this.camera, this.clock.currentTime, range);
    this.alignFocusedTarget();
    this.scene.requestRender();
  }

  private celestialLayoutKey(): string {
    const { top, bottom, left, right } = this.defaultCompositionInsets;
    return `${this.canvas.clientWidth}:${this.canvas.clientHeight}:${top}:${bottom}:${left}:${right}`;
  }

}

function normalizeInsets(insets: CameraCompositionInsets): CameraCompositionInsets {
  return {
    bottom: Math.max(0, insets.bottom),
    left: Math.max(0, insets.left),
    right: Math.max(0, insets.right),
    top: Math.max(0, insets.top),
  };
}

export function earthRangeForComposition(
  radiusMeters: number,
  verticalFovRadians: number,
  viewportHeight: number,
  targetOccupancy: number,
  insets: CameraCompositionInsets,
  viewportWidth = viewportHeight,
): number {
  const safeHeight = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const safeWidth = Math.max(1, viewportWidth - insets.left - insets.right);
  const safeFraction = Math.min(1, Math.min(safeHeight, safeWidth) / Math.max(1, viewportHeight));
  const angularDiameter = 2 * Math.atan(Math.tan(verticalFovRadians / 2) *
    safeFraction * Math.max(0.1, Math.min(0.9, targetOccupancy)));
  return Math.max(
    radiusMeters * 1.03,
    radiusMeters / Math.sin(angularDiameter / 2),
  );
}
