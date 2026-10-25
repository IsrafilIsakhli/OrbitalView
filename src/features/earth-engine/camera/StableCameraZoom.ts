import { CameraEventType, Cartesian2, Cartesian3, Cartographic, Ellipsoid, Matrix4, type Camera, type Scene } from "cesium";

export const EARTH_MAXIMUM_ZOOM_METERS = 100_000_000;
export const CAMERA_CLEARANCE_METERS = 900;
const nativeZoomGestures = [CameraEventType.RIGHT_DRAG, CameraEventType.PINCH];

/** Wheel distance is symmetric and bounded, even for trackpads and stalled frames. */
export function wheelZoomImpulse(delta: number, mode: number, height: number): number {
  if (!Number.isFinite(delta)) return 0;
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? Math.max(1, height) : 1);
  return Math.max(-0.65, Math.min(0.65, pixels * 0.002));
}

/** Public Cesium camera API only. Never depth-pick satellites/clouds as zoom targets. */
export class StableCameraZoom {
  private remaining = 0;
  private enabled = true;
  private celestialBounds: { minimum: number; maximum: number } | null = null;
  private readonly anchor = new Cartesian3();
  private readonly candidate = new Cartesian3();
  private readonly start = new Cartesian3();
  private readonly pixel = new Cartesian2();
  private readonly world = new Cartesian3();
  private readonly surface = new Cartographic();

  constructor(private readonly scene: Scene, private readonly camera: Camera, private readonly canvas: HTMLCanvasElement) {
    this.setEnabled(true);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  setEnabled(enabled: boolean): void {
    this.cancel();
    this.enabled = enabled;
    this.scene.screenSpaceCameraController.zoomEventTypes = enabled
      ? nativeZoomGestures : [...nativeZoomGestures, CameraEventType.WHEEL];
  }

  get moving(): boolean { return this.remaining !== 0; }
  cancel(): void { this.remaining = 0; }

  setCelestialRadius(radius: number | null): void {
    this.cancel();
    this.celestialBounds = radius === null ? null : { minimum: radius * 1.12, maximum: radius * 30 };
  }

  zoom(direction: "in" | "out"): void {
    if (!this.enabled) return;
    this.queue(direction === "in" ? -0.3 : 0.3, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  tick(deltaSeconds: number): void {
    if (!this.moving) return;
    const impulse = Math.abs(this.remaining) < 0.001
      ? this.remaining : this.remaining * (1 - Math.exp(-18 * Math.max(0, Math.min(0.05, deltaSeconds))));
    this.remaining -= impulse;
    const tracked = !Matrix4.equals(this.camera.transform, Matrix4.IDENTITY);
    const anchor = tracked ? Cartesian3.ZERO : this.anchor;
    Cartesian3.clone(this.camera.position, this.start);
    Cartesian3.lerp(anchor, this.start, Math.exp(impulse), this.candidate);
    const valid = (position: Cartesian3): boolean => {
      if (this.celestialBounds) {
        const range = Cartesian3.magnitude(position);
        return Number.isFinite(range) && range >= this.celestialBounds.minimum && range <= this.celestialBounds.maximum;
      }
      const world = tracked ? Matrix4.multiplyByPoint(this.camera.transform, position, this.world) : position;
      const surface = Ellipsoid.WGS84.cartesianToCartographic(world, this.surface);
      if (!surface || !Number.isFinite(surface.height)) return false;
      const terrain = surface.height < 20_000 ? this.scene.globe?.getHeight(surface) ?? 0 : 0;
      const range = Cartesian3.magnitude(position);
      return surface.height >= Math.max(0, terrain) + CAMERA_CLEARANCE_METERS &&
        (tracked ? range >= CAMERA_CLEARANCE_METERS && range <= EARTH_MAXIMUM_ZOOM_METERS : surface.height <= EARTH_MAXIMUM_ZOOM_METERS);
    };
    if (!valid(this.candidate)) {
      // Stop at the last safe point along the requested path, never cross Earth
      // and clamp back on its opposite side. Direction changes take effect immediately.
      let low = 0, high = 1;
      const proposed = Cartesian3.clone(this.candidate);
      for (let i = 0; i < 24; i++) {
        const middle = (low + high) / 2;
        Cartesian3.lerp(this.start, proposed, middle, this.candidate);
        if (valid(this.candidate)) low = middle; else high = middle;
      }
      Cartesian3.lerp(this.start, proposed, low, this.candidate);
      this.cancel();
    }
    Cartesian3.clone(this.candidate, this.camera.position);
    this.scene.requestRender();
  }

  dispose(): void { this.cancel(); this.canvas.removeEventListener("wheel", this.onWheel); }

  private queue(impulse: number, x: number, y: number): void {
    if (!impulse) return;
    if (!this.moving || Math.sign(impulse) !== Math.sign(this.remaining)) {
      this.cancel();
      this.pixel.x = x; this.pixel.y = y;
      // Ellipsoid picking cannot latch onto marker depth or trigger a GPU readback.
      const picked = Matrix4.equals(this.camera.transform, Matrix4.IDENTITY)
        ? this.camera.pickEllipsoid(this.pixel, Ellipsoid.WGS84, this.anchor) : undefined;
      if (!picked) Cartesian3.clone(Cartesian3.ZERO, this.anchor);
    }
    this.remaining = Math.max(-1, Math.min(1, this.remaining + impulse));
    this.scene.requestRender();
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled || !this.scene.screenSpaceCameraController.enableInputs) return;
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.queue(wheelZoomImpulse(event.deltaY, event.deltaMode, this.canvas.clientHeight), event.clientX - rect.left, event.clientY - rect.top);
  };
}
