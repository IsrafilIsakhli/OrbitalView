import { describe, expect, it } from "vitest";
import type { DynamicsSample } from "./analysis";
import { radiusSchematic } from "./radiusSchematic";

describe("Orbital radius schematic phase", () => {
  const radiusKm = 7_000;
  const angularSpeed = 2 * Math.PI / 6_000;
  const sample = (seconds: number) => ({
    radiusKm, timestampUnixMs: seconds * 1_000,
    angularMomentumKm2PerSecond: angularSpeed * radiusKm ** 2,
  }) as DynamicsSample;
  it("draws a quarter orbit for a quarter-period time interval", () => {
    const { points } = radiusSchematic([sample(0), sample(750), sample(1500)]);
    expect(points[2]!.x).toBeCloseTo(radiusKm);
    expect(points[2]!.y).toBeCloseTo(0);
  });
  it("uses elapsed time across missing samples and multiple revolutions", () => {
    const { points } = radiusSchematic([sample(0), sample(7500)]);
    expect(points[1]!.x).toBeCloseTo(radiusKm);
    expect(points[1]!.y).toBeCloseTo(0);
    expect(radiusSchematic([]).points).toEqual([]);
  });
});
