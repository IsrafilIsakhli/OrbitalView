import { describe, expect, it } from "vitest";

import { designMissionScenario } from "./missionDesign";

const orbit = { inclinationDegrees: 51.64, meanMotionRevolutionsPerDay: 15.5 };

describe("mission design scenarios", () => {
  it("computes a bounded two-burn Hohmann altitude change", () => {
    const result = designMissionScenario(orbit, {
      mode: "altitude",
      phaseChangeDegrees: 0,
      phasingRevolutions: 1,
      spacecraftMassKg: 500,
      specificImpulseSeconds: 320,
      targetAltitudeKm: 550,
      targetInclinationDegrees: 51.64,
    });
    expect(result.burnOneMetersPerSecond).toBeGreaterThan(0);
    expect(result.burnTwoMetersPerSecond).toBeGreaterThan(0);
    expect(result.totalDeltaVMetersPerSecond).toBeCloseTo(
      result.burnOneMetersPerSecond + result.burnTwoMetersPerSecond,
      8,
    );
    expect(result.propellantMassKg).toBeGreaterThan(0);
  });

  it("returns zero delta-v for an unchanged plane", () => {
    const result = designMissionScenario(orbit, {
      mode: "planeChange",
      phaseChangeDegrees: 0,
      phasingRevolutions: 1,
      spacecraftMassKg: null,
      specificImpulseSeconds: null,
      targetAltitudeKm: 400,
      targetInclinationDegrees: orbit.inclinationDegrees,
    });
    expect(result.totalDeltaVMetersPerSecond).toBeCloseTo(0, 8);
    expect(result.propellantMassKg).toBeNull();
  });

  it("computes a reversible one-revolution phasing scenario", () => {
    const result = designMissionScenario(orbit, {
      mode: "phasing",
      phaseChangeDegrees: 5,
      phasingRevolutions: 1,
      spacecraftMassKg: null,
      specificImpulseSeconds: null,
      targetAltitudeKm: 400,
      targetInclinationDegrees: 51.64,
    });
    expect(result.burnOneMetersPerSecond).toBeCloseTo(result.burnTwoMetersPerSecond, 8);
    expect(result.durationSeconds).toBeGreaterThan(0);
  });

  it("rejects the previously accepted Earth-intersecting phasing orbit", () => {
    expect(() => designMissionScenario(orbit, {
      mode: "phasing", phaseChangeDegrees: 20, phasingRevolutions: 1,
      spacecraftMassKg: null, specificImpulseSeconds: null,
      targetAltitudeKm: 400, targetInclinationDegrees: 51.64,
    })).toThrow("intersects Earth");
  });
  it("rejects invalid source data and non-finite fuel inputs", () => {
    const input = { mode: "altitude" as const, phaseChangeDegrees: 0, phasingRevolutions: 1,
      spacecraftMassKg: null, specificImpulseSeconds: null, targetAltitudeKm: 550, targetInclinationDegrees: 51.64 };
    expect(() => designMissionScenario({ ...orbit, meanMotionRevolutionsPerDay: 0 }, input)).toThrow();
    expect(() => designMissionScenario(orbit, { ...input, spacecraftMassKg: Infinity })).toThrow();
  });
});
