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

const INTERACTION_PAUSE_MS = 10_000;
const CINEMATIC_ROTATION_RADIANS_PER_SECOND = 0.00062;
const MINIMUM_ROTATION_HEIGHT_METERS = 1_150_000;
const MOON_VIEW_DISTANCE_METERS = 4_800_000;
const SUN_VIEW_DISTANCE_METERS = 28_000_000_000;
const EARTH_RADIUS_METERS = 6_378_137;

const inertialPositionScratch = new Cartesian3();
const fixedPositionScratch = new Cartesian3();
const celestialDirectionScratch = new Cartesian3();
const celestialDestinationScratch = new Cartesian3();
const celestialOffsetScratch = new Cartesian3();
const celestialRightScratch = new Cartesian3();
const celestialUpScratch = new Cartesian3();
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
  private autoRotation = true;
  private objectFocusActive = false;
  private activePreset: CameraPresetId = "earth";
  private lastInteractionAt = Number.NEGATIVE_INFINITY;
  private reducedMotion = false;
  private defaultEarthState: DefaultEarthCameraState | null = null;
  private defaultEarthViewpoint: EarthViewpoint | null = null;
  private returnFrame: number | null = null;
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
    controller.enableLook = true;
    controller.inertiaSpin = 0.88;
    controller.inertiaTranslate = 0.82;
    controller.inertiaZoom = 0.78;
    controller.maximumMovementRatio = 0.12;
    controller.minimumZoomDistance = 900;
    controller.maximumZoomDistance = 220_000_000_000;
    controller.zoomFactor = 4.25;

    canvas.addEventListener("pointerdown", this.handleManualInput, {
      passive: true,
    });
    canvas.addEventListener("touchstart", this.handleManualInput, {
      passive: true,
    });
    canvas.addEventListener("wheel", this.handleManualInput, { passive: true });
  }

  flyTo(presetId: CameraPresetId, immediate = false): void {
    this.cancelPendingReturn();
    this.objectFocusActive = false;
    const preset = cameraPresets[presetId];
    this.markInteraction();
    this.activePreset = presetId;
    this.onPresetChanged(presetId);
    this.camera.cancelFlight();
    this.camera.lookAtTransform(Matrix4.IDENTITY);

    if (presetId === "moon" || presetId === "sun") {
      this.flyToCelestialBody(presetId, immediate);
      return;
    }

    if (presetId === "earth") {
      this.defaultEarthViewpoint = this.daylightEarthViewpoint();
      this.refreshDefaultEarthState();
      this.flyToDefaultEarth(immediate);
      return;
    }
    const destination = Cartesian3.fromDegrees(
      preset.longitudeDegrees,
      preset.latitudeDegrees,
      preset.heightMeters,
    );
    this.camera.flyTo({
      destination,
      duration:
        immediate || this.reducedMotion ? 0 : preset.durationSeconds,
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
        this.alignFocusedTarget(range);
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
        this.flyToDefaultEarth(this.reducedMotion);
      });
    });
    return true;
  }

  /** Pause cinematic auto-rotation after UI-driven focus/follow actions that
   *  do not originate on the canvas (toolbar buttons, inspector toggles). */
  noteUserActivity(): void {
    this.markInteraction();
  }

  /** Selection/follow owns the camera until an explicit preset or close. */
  beginObjectFocus(): void {
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
  alignFocusedTarget(range: number): void {
    const fovy = (this.camera.frustum as { fovy?: number }).fovy ?? Math.PI / 3;
    const metersPerPixel = 2 * range * Math.tan(fovy / 2) / Math.max(1, this.canvas.clientHeight);
    const { left, right, top, bottom } = this.compositionInsets;
    this.camera.moveRight((right - left) * metersPerPixel * 0.5);
    this.camera.moveUp((top - bottom) * metersPerPixel * 0.5);
    this.scene.requestRender();
  }

  setCompositionInsets(insets: CameraCompositionInsets): void {
    this.compositionInsets = normalizeInsets(insets);
  }

  setDefaultCompositionInsets(insets: CameraCompositionInsets): void {
    this.defaultCompositionInsets = normalizeInsets(insets);
    if (this.defaultEarthViewpoint !== null) this.refreshDefaultEarthState();
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
  }

  tick(deltaSeconds: number): void {
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

  dispose(): void {
    this.cancelPendingReturn();
    this.camera.cancelFlight();
    this.defaultEarthState = null;
    this.canvas.removeEventListener("pointerdown", this.handleManualInput);
    this.canvas.removeEventListener("touchstart", this.handleManualInput);
    this.canvas.removeEventListener("wheel", this.handleManualInput);
  }

  private cancelPendingReturn(): void {
    if (this.returnFrame !== null) cancelAnimationFrame(this.returnFrame);
    this.returnFrame = null;
  }

  private readonly markInteraction = (): void => {
    this.lastInteractionAt = performance.now();
  };

  private readonly handleManualInput = (): void => {
    this.cancelPendingReturn();
    this.camera.cancelFlight();
    this.markInteraction();
    this.scene.requestRender();
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
    // Translate the default camera in its image plane. This centers the globe
    // in the measured free rectangle without changing a user's manual camera.
    const metersPerPixel = 2 * range * Math.tan(verticalFov / 2) / Math.max(1, this.canvas.clientHeight);
    const insets = this.defaultCompositionInsets;
    Cartesian3.add(destination, Cartesian3.multiplyByScalar(right,
      (insets.right - insets.left) * 0.5 * metersPerPixel, earthRightScratch), destination);
    Cartesian3.add(destination, Cartesian3.multiplyByScalar(up,
      (insets.top - insets.bottom) * 0.5 * metersPerPixel, celestialOffsetScratch), destination);
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

  private flyToCelestialBody(
    body: "moon" | "sun",
    immediate: boolean,
  ): void {
    const inertialPosition = body === "moon"
      ? Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
          this.clock.currentTime,
          inertialPositionScratch,
        )
      : Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
          this.clock.currentTime,
          inertialPositionScratch,
        );
    const inertialToFixed =
      Transforms.computeIcrfToFixedMatrix(this.clock.currentTime, transformScratch)
      ?? Transforms.computeTemeToPseudoFixedMatrix(
        this.clock.currentTime,
        transformScratch,
      );
    const bodyPosition = Matrix3.multiplyByVector(
      inertialToFixed,
      inertialPosition,
      fixedPositionScratch,
    );
    const outward = Cartesian3.normalize(
      bodyPosition,
      celestialDirectionScratch,
    );
    const viewDistance = body === "moon"
      ? MOON_VIEW_DISTANCE_METERS
      : SUN_VIEW_DISTANCE_METERS;
    const destination = Cartesian3.add(
      bodyPosition,
      Cartesian3.multiplyByScalar(
        outward,
        viewDistance,
        celestialDestinationScratch,
      ),
      celestialDestinationScratch,
    );
    const offsetReference = Math.abs(Cartesian3.dot(outward, Cartesian3.UNIT_Z)) > 0.92
      ? Cartesian3.UNIT_Y
      : Cartesian3.UNIT_Z;
    const offset = Cartesian3.normalize(
      Cartesian3.cross(outward, offsetReference, celestialOffsetScratch),
      celestialOffsetScratch,
    );
    Cartesian3.add(
      destination,
      Cartesian3.multiplyByScalar(
        offset,
        viewDistance * (body === "moon" ? 0.44 : 0.22),
        celestialOffsetScratch,
      ),
      destination,
    );
    const direction = Cartesian3.normalize(
      Cartesian3.subtract(bodyPosition, destination, celestialDirectionScratch),
      celestialDirectionScratch,
    );
    const upReference = Math.abs(Cartesian3.dot(direction, Cartesian3.UNIT_Z)) > 0.92
      ? Cartesian3.UNIT_Y
      : Cartesian3.UNIT_Z;
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, upReference, celestialRightScratch),
      celestialRightScratch,
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, direction, celestialUpScratch),
      celestialUpScratch,
    );

    this.camera.flyTo({
      destination: Cartesian3.clone(destination),
      duration: immediate || this.reducedMotion
        ? 0
        : cameraPresets[body].durationSeconds,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      orientation: {
        direction: Cartesian3.clone(direction),
        up: Cartesian3.clone(up),
      },
    });
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
