import { Cartesian3, type Camera, type JulianDate, Matrix3, Matrix4, Simon1994PlanetaryPositions, Transforms } from "cesium";

export type CelestialBody = "moon" | "sun";
export const celestialRadii = { moon: 1_737_400, sun: 695_500_000 } as const;

/** Keep the camera in the body's inertial frame as Earth-fixed axes rotate. */
export class CelestialCameraFrame {
  private body: CelestialBody | null = null;
  private readonly inertial = new Cartesian3();
  private readonly center = new Cartesian3();
  private readonly sun = new Cartesian3();
  private readonly offset = new Cartesian3();
  private readonly rotation = new Matrix3();
  private readonly transform = new Matrix4();
  private readonly position = new Cartesian3();
  private readonly direction = new Cartesian3();
  private readonly up = new Cartesian3();
  private readonly right = new Cartesian3();

  begin(body: CelestialBody, camera: Camera, time: JulianDate, range: number): void {
    this.body = body;
    this.computeTransform(time);
    if (body === "moon") {
      Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, this.sun);
      Cartesian3.subtract(this.sun, this.inertial, this.offset);
    } else {
      Cartesian3.negate(this.inertial, this.offset);
    }
    // A sunward lunar viewpoint shows the LRO surface instead of a black disc.
    Cartesian3.normalize(this.offset, this.offset);
    Cartesian3.multiplyByScalar(this.offset, range, this.offset);
    camera.lookAtTransform(this.transform, this.offset);
  }

  update(camera: Camera, time: JulianDate): void {
    if (!this.body) return;
    Cartesian3.clone(camera.position, this.position);
    Cartesian3.clone(camera.direction, this.direction);
    Cartesian3.clone(camera.up, this.up);
    Cartesian3.clone(camera.right, this.right);
    this.computeTransform(time);
    camera.lookAtTransform(this.transform);
    Cartesian3.clone(this.position, camera.position);
    Cartesian3.clone(this.direction, camera.direction);
    Cartesian3.clone(this.up, camera.up);
    Cartesian3.clone(this.right, camera.right);
  }

  clear(): void { this.body = null; }

  private computeTransform(time: JulianDate): void {
    if (this.body === "moon") Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(time, this.inertial);
    else Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(time, this.inertial);
    const rotation = Transforms.computeIcrfToFixedMatrix(time, this.rotation)
      ?? Transforms.computeTemeToPseudoFixedMatrix(time, this.rotation);
    Matrix3.multiplyByVector(rotation, this.inertial, this.center);
    Matrix4.fromRotationTranslation(rotation, this.center, this.transform);
  }
}
