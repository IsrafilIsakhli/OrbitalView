import { Cartesian3, Cartographic, Ellipsoid, Matrix4, Transforms, type Camera } from "cesium";

/** Track the real target's ENU frame, not a per-frame heading/range preset.
 * Local camera controls remain Cesium-owned: zoom and orbit gestures survive.
 */
export class FollowCameraFrame {
  private readonly transform = new Matrix4();
  private readonly position = new Cartesian3();
  private readonly direction = new Cartesian3();
  private readonly up = new Cartesian3();
  private readonly right = new Cartesian3();
  private readonly surface = new Cartographic();
  private readonly worldPosition = new Cartesian3();
  private readonly boundTarget = new Cartesian3();
  private bound = false;

  begin(camera: Camera, target: Cartesian3): void {
    // Without an offset, the public API preserves the world pose on binding.
    camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(target, undefined, this.transform));
    Cartesian3.clone(target, this.boundTarget);
    this.bound = true;
  }

  update(camera: Camera, target: Cartesian3, minimumHeightMeters = 900): void {
    if (!this.bound) { this.begin(camera, target); return; }
    if (!Cartesian3.equals(target, this.boundTarget)) {
      Cartesian3.clone(camera.position, this.position);
      Cartesian3.clone(camera.direction, this.direction);
      Cartesian3.clone(camera.up, this.up);
      Cartesian3.clone(camera.right, this.right);
      camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(target, undefined, this.transform));
      // Preserve local user input while the target carries the camera.
      Cartesian3.clone(this.position, camera.position);
      Cartesian3.clone(this.direction, camera.direction);
      Cartesian3.clone(this.up, camera.up);
      Cartesian3.clone(this.right, camera.right);
      Cartesian3.clone(target, this.boundTarget);
    }
    // Cesium's tracked-frame controls orbit a local unit sphere; its ordinary
    // globe collision constraint no longer protects the physical Earth. Clamp
    // only the camera clearance, never the propagated satellite coordinates.
    const surface = Ellipsoid.WGS84.cartesianToCartographic(camera.positionWC, this.surface);
    if (surface && surface.height < minimumHeightMeters) {
      surface.height = minimumHeightMeters;
      Ellipsoid.WGS84.cartographicToCartesian(surface, this.worldPosition);
      Matrix4.multiplyByPoint(camera.inverseTransform, this.worldPosition, camera.position);
    }
  }

  clear(): void { this.bound = false; }
}
