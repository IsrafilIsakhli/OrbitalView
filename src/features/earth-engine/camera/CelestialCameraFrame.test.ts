import { Camera, Cartesian3, Ellipsoid, GeographicProjection, JulianDate, Matrix4, type Scene } from "cesium";
import { describe, expect, it } from "vitest";
import { CelestialCameraFrame, celestialRadii } from "./CelestialCameraFrame";

function cameraForTest() {
  return new Camera({
    canvas: { clientWidth: 1440, clientHeight: 900 }, drawingBufferWidth: 1440, drawingBufferHeight: 900,
    mapProjection: new GeographicProjection(), ellipsoid: Ellipsoid.WGS84,
  } as unknown as Scene);
}

describe("Celestial camera reference frame", () => {
  for (const body of ["moon", "sun"] as const) {
    it(`frames ${body} at its own radius instead of an Earth zoom distance`, () => {
      const camera = cameraForTest();
      const frame = new CelestialCameraFrame();
      frame.begin(body, camera, JulianDate.fromIso8601("2026-10-25T19:00:00Z"), celestialRadii[body] * 3);
      expect(Cartesian3.magnitude(camera.position)).toBeCloseTo(celestialRadii[body] * 3, 1);
      expect(Cartesian3.dot(Cartesian3.normalize(camera.position, new Cartesian3()), camera.direction)).toBeCloseTo(-1, 8);
      const center = Matrix4.getTranslation(camera.transform, new Cartesian3());
      expect(Cartesian3.magnitude(center)).toBeGreaterThan(body === "moon" ? 300_000_000 : 100_000_000_000);
    });
    it(`preserves manual zoom and orientation while ${body} follows UTC`, () => {
      const camera = cameraForTest();
      const frame = new CelestialCameraFrame();
      const time = JulianDate.fromIso8601("2026-10-25T19:00:00Z");
      frame.begin(body, camera, time, celestialRadii[body] * 3);
      camera.zoomIn(celestialRadii[body] / 2);
      camera.rotateRight(0.2);
      const local = Cartesian3.clone(camera.position), direction = Cartesian3.clone(camera.direction);
      const world = Cartesian3.clone(camera.positionWC);
      frame.update(camera, JulianDate.addSeconds(time, 60, new JulianDate()));
      expect(Cartesian3.distance(local, camera.position)).toBeLessThan(0.001);
      expect(Cartesian3.distance(direction, camera.direction)).toBeLessThan(1e-10);
      expect(Cartesian3.distance(world, camera.positionWC)).toBeGreaterThan(1_000);
    });
  }
});
