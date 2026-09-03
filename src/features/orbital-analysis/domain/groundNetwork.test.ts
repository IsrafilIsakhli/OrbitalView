import { describe, expect, it } from "vitest";

import type { GroundNetworkStationResult, GroundStationPass } from "./analysis";
import { calculateGroundNetworkGaps, mergeGroundNetworkWindows } from "./groundNetwork";

describe("ground network contact coverage", () => {
  it("merges overlapping station windows without double-counting contact time", () => {
    const merged = mergeGroundNetworkWindows([
      stationResult("baku", [pass(1_000, 5_000)]),
      stationResult("ankara", [pass(4_000, 8_000), pass(12_000, 13_000)]),
    ]);
    expect(merged).toEqual([
      { endUnixMs: 8_000, startUnixMs: 1_000, stationIds: ["baku", "ankara"] },
      { endUnixMs: 13_000, startUnixMs: 12_000, stationIds: ["ankara"] },
    ]);
  });

  it("calculates leading, internal and trailing communication gaps", () => {
    const gaps = calculateGroundNetworkGaps(0, 20_000, [
      { endUnixMs: 8_000, startUnixMs: 1_000, stationIds: ["a"] },
      { endUnixMs: 13_000, startUnixMs: 12_000, stationIds: ["b"] },
    ]);
    expect(gaps.map((gap) => gap.durationSeconds)).toEqual([1, 4, 7]);
  });
});

function stationResult(id: string, passes: GroundStationPass[]): GroundNetworkStationResult {
  return {
    invalidSampleCount: 0,
    passes,
    station: {
      altitudeMeters: 0,
      downlinkFrequencyHz: null,
      id,
      latitudeDegrees: 0,
      longitudeDegrees: 0,
      minimumElevationDegrees: 10,
      name: id,
    },
  };
}

function pass(aosUnixMs: number, losUnixMs: number): GroundStationPass {
  return {
    aosAzimuthDegrees: 0,
    aosUnixMs,
    continuous: false,
    durationSeconds: (losUnixMs - aosUnixMs) / 1_000,
    losAzimuthDegrees: 0,
    losUnixMs,
    maximumElevationDegrees: 30,
    minimumRangeKm: 500,
    samples: [],
    tcaUnixMs: (aosUnixMs + losUnixMs) / 2,
  };
}
