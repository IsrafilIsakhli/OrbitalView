import { describe, expect, it } from "vitest";

import type { CoveragePass } from "./analysis";
import { calculateCoverageGaps, mergeCoverageWindows, solarElevationDegrees } from "./coverage";

function pass(satelliteId: string, aosUnixMs: number, losUnixMs: number): CoveragePass {
  return {
    aosAzimuthDegrees: 0,
    aosUnixMs,
    continuous: false,
    durationSeconds: (losUnixMs - aosUnixMs) / 1_000,
    lighting: "day",
    losAzimuthDegrees: 180,
    losUnixMs,
    maximumElevationDegrees: 50,
    minimumRangeKm: 500,
    samples: [],
    satelliteId,
    satelliteName: satelliteId,
    sunElevationDegrees: 30,
    tcaUnixMs: (aosUnixMs + losUnixMs) / 2,
  };
}

describe("coverage geometry helpers", () => {
  it("merges overlapping windows while preserving contributing object ids", () => {
    const windows = mergeCoverageWindows([pass("a", 1_000, 4_000), pass("b", 3_000, 6_000)]);
    expect(windows).toEqual([{ endUnixMs: 6_000, satelliteIds: ["a", "b"], startUnixMs: 1_000 }]);
  });

  it("returns the leading and trailing revisit gaps", () => {
    const gaps = calculateCoverageGaps(0, 10_000, [
      { endUnixMs: 6_000, satelliteIds: ["a"], startUnixMs: 2_000 },
    ]);
    expect(gaps.map((gap) => gap.durationSeconds)).toEqual([2, 4]);
    expect(gaps.map((gap) => gap.kind)).toEqual(["leading", "trailing"]);
    expect(gaps.filter((gap) => gap.kind === "between-passes")).toHaveLength(0);
  });

  it("distinguishes equatorial day and night around the equinox", () => {
    const noon = solarElevationDegrees(0, 0, Date.parse("2026-03-20T12:00:00Z"));
    const midnight = solarElevationDegrees(0, 0, Date.parse("2026-03-20T00:00:00Z"));
    expect(noon).toBeGreaterThan(85);
    expect(midnight).toBeLessThan(-85);
  });
});
