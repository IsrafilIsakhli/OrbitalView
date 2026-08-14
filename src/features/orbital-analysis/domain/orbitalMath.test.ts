import { describe, expect, it } from "vitest";

import {
  angularMomentumMagnitude,
  classicalDopplerShiftHz,
  derivedApsides,
  normalizeLongitudeDegrees,
  projectRelativePositionToRtn,
  specificOrbitalEnergy,
} from "./orbitalMath";

describe("orbital analysis mathematics", () => {
  it("uses the SGP4 WGS-72 energy and angular momentum definitions", () => {
    const position = { x: 7_000, y: 0, z: 0 };
    const velocity = { x: 0, y: 7.546, z: 0 };
    expect(specificOrbitalEnergy(position, velocity)).toBeCloseTo(-28.471, 2);
    expect(angularMomentumMagnitude(position, velocity)).toBeCloseTo(52_822, 0);
  });

  it("derives symmetric apsides for a circular mean-motion orbit", () => {
    const result = derivedApsides({
      eccentricity: 0,
      meanMotionRevolutionsPerDay: 15.5,
    });
    expect(result.apogeeKm).toBeCloseTo(result.perigeeKm, 8);
    expect(result.apogeeKm).toBeGreaterThan(300);
    expect(result.apogeeKm).toBeLessThan(500);
  });

  it("wraps longitude and preserves the Doppler sign convention", () => {
    expect(normalizeLongitudeDegrees(190)).toBe(-170);
    expect(normalizeLongitudeDegrees(-190)).toBe(170);
    expect(classicalDopplerShiftHz(-1, 100_000_000)).toBeGreaterThan(0);
    expect(classicalDopplerShiftHz(1, 100_000_000)).toBeLessThan(0);
  });

  it("projects relative position onto an orthogonal RTN basis", () => {
    const result = projectRelativePositionToRtn(
      { x: 7_000, y: 0, z: 0 },
      { x: 0, y: 7.5, z: 0 },
      { x: 2, y: 3, z: 4 },
    );
    expect(result?.alongTrackSeparationKm).toBeCloseTo(3, 10);
    expect(result?.crossTrackSeparationKm).toBeCloseTo(4, 10);
    expect(result?.radialSeparationKm).toBeCloseTo(2, 10);
  });
});
