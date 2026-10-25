import { describe, expect, it, vi } from "vitest";
import { CesiumSatelliteLayer, initialSatelliteLayerSnapshot } from "./CesiumSatelliteLayer";
import type { OrbitWorkerResponse } from "../worker/messages";

describe("Independent selected-object updates", () => {
  it("updates only the selected record and rejects stale results after selection changes", () => {
    const layer = new CesiumSatelliteLayer();
    const positions = new Float64Array([1, 2, 3, 10, 20, 30]);
    const refreshSelection = vi.fn();
    Object.assign(layer, {
      catalog: [{ id: "a", category: "station" }, { id: "b", category: "science" }],
      snapshot: { ...initialSatelliteLayerSnapshot, selectedId: "a" },
      latestPositions: positions, latestTelemetry: new Float64Array(4), latestErrors: new Int8Array(2),
      refreshSelectionVisuals: refreshSelection,
    });
    const receive = (message: OrbitWorkerResponse) => (layer as unknown as { handleWorkerMessage(message: OrbitWorkerResponse): void }).handleWorkerMessage(message);
    const frame = { type: "selected-frame", index: 0, positionMeters: [4, 5, 6], altitudeKm: 420, velocityKmPerSecond: 7.6, timestampUnixMs: 2_000 } as const;
    receive({ ...frame, positionMeters: [4, 5, 6] });
    expect([...positions]).toEqual([4, 5, 6, 10, 20, 30]);
    receive({ ...frame, positionMeters: [7, 8, 9], timestampUnixMs: 1_000 });
    expect([...positions]).toEqual([4, 5, 6, 10, 20, 30]);
    Object.assign(layer, { snapshot: { ...initialSatelliteLayerSnapshot, selectedId: "b" } });
    receive({ ...frame, positionMeters: [7, 8, 9], timestampUnixMs: 3_000 });
    expect([...positions]).toEqual([4, 5, 6, 10, 20, 30]);
    expect(refreshSelection).toHaveBeenCalledOnce();
  });
  it("does not let a queued forecast response poison the live-time cursor", () => {
    const layer = new CesiumSatelliteLayer();
    const positions = new Float64Array([1, 2, 3]);
    Object.assign(layer, {
      catalog: [{ id: "a", category: "station" }],
      snapshot: { ...initialSatelliteLayerSnapshot, selectedId: "a" },
      propagationRevision: 2,
      latestPositions: positions, latestTelemetry: new Float64Array(2), latestErrors: new Int8Array(1),
      refreshSelectionVisuals: vi.fn(),
    });
    const receive = (message: OrbitWorkerResponse) => (layer as unknown as { handleWorkerMessage(message: OrbitWorkerResponse): void }).handleWorkerMessage(message);
    receive({ type: "selected-frame", revision: 1, index: 0, positionMeters: [9, 9, 9], timestampUnixMs: 99_999, altitudeKm: 420, velocityKmPerSecond: 7.6 });
    expect([...positions]).toEqual([1, 2, 3]);
    receive({ type: "selected-frame", revision: 2, index: 0, positionMeters: [4, 5, 6], timestampUnixMs: 2_000, altitudeKm: 420, velocityKmPerSecond: 7.6 });
    expect([...positions]).toEqual([4, 5, 6]);
  });
});
