import { Cartesian3, PointPrimitiveCollection } from "cesium";
import { describe, expect, it } from "vitest";
import { CesiumSatelliteLayer } from "./CesiumSatelliteLayer";

describe("Satellite GPU position updates", () => {
  it("invalidates Cesium point storage instead of silently mutating its getter", () => {
    const points = new PointPrimitiveCollection();
    const point = points.add({ position: new Cartesian3(1, 2, 3) });
    const layer = new CesiumSatelliteLayer();
    // The actual-position copy is what Cesium sends to its GPU buffers.
    const actual = point as unknown as { _actualPosition: Cartesian3 };
    const frame = (x: number) => {
      Object.assign(layer, {
        catalog: [{ category: "station" }],
        latestPositions: new Float64Array([x, 20, 30]),
        latestErrors: new Int8Array([0]),
        renderedIndices: [0], renderedPoints: [point],
      });
      (layer as unknown as { applyFrame(): void }).applyFrame();
    };
    frame(10);
    expect(actual._actualPosition).toEqual(new Cartesian3(10, 20, 30));
    frame(11);
    expect(actual._actualPosition).toEqual(new Cartesian3(11, 20, 30));
    points.destroy();
  });
});
