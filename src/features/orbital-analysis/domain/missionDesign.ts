import type { SatelliteRecord } from "@/features/satellites/domain/satellite";

import { SGP4_EARTH_RADIUS_KM, SGP4_MU_KM3_PER_SECOND2, semiMajorAxisKm } from "./orbitalMath";

const STANDARD_GRAVITY_METERS_PER_SECOND2 = 9.80665;

export type MissionDesignMode = "altitude" | "planeChange" | "phasing";

export interface MissionDesignInput {
  mode: MissionDesignMode;
  targetAltitudeKm: number;
  targetInclinationDegrees: number;
  phaseChangeDegrees: number;
  phasingRevolutions: number;
  spacecraftMassKg: number | null;
  specificImpulseSeconds: number | null;
}

export interface MissionDesignResult {
  burnOneMetersPerSecond: number;
  burnTwoMetersPerSecond: number;
  durationSeconds: number;
  initialAltitudeKm: number;
  initialInclinationDegrees: number;
  mode: MissionDesignMode;
  propellantMassKg: number | null;
  targetAltitudeKm: number;
  targetInclinationDegrees: number;
  totalDeltaVMetersPerSecond: number;
}

export function designMissionScenario(
  satellite: Pick<SatelliteRecord, "inclinationDegrees" | "meanMotionRevolutionsPerDay">,
  input: MissionDesignInput,
): MissionDesignResult {
  finiteRange(satellite.meanMotionRevolutionsPerDay, 0.01, 20, "mean motion");
  finiteRange(satellite.inclinationDegrees, 0, 180, "initial inclination");
  if (input.spacecraftMassKg !== null) finiteRange(input.spacecraftMassKg, 0.001, 1e9, "spacecraft mass");
  if (input.specificImpulseSeconds !== null) finiteRange(input.specificImpulseSeconds, 0.001, 1e7, "specific impulse");
  const initialRadiusKm = semiMajorAxisKm(satellite.meanMotionRevolutionsPerDay);
  if (initialRadiusKm <= SGP4_EARTH_RADIUS_KM) throw new Error("initial orbit intersects Earth");
  const initialAltitudeKm = initialRadiusKm - SGP4_EARTH_RADIUS_KM;
  let burnOneKmPerSecond: number;
  let burnTwoKmPerSecond = 0;
  let durationSeconds = 0;
  let targetAltitudeKm = initialAltitudeKm;
  let targetInclinationDegrees = satellite.inclinationDegrees;

  if (input.mode === "altitude") {
    targetAltitudeKm = finiteRange(input.targetAltitudeKm, 100, 100_000, "target altitude");
    const targetRadiusKm = SGP4_EARTH_RADIUS_KM + targetAltitudeKm;
    const transferSemiMajorKm = (initialRadiusKm + targetRadiusKm) / 2;
    const initialCircularVelocity = circularVelocity(initialRadiusKm);
    const targetCircularVelocity = circularVelocity(targetRadiusKm);
    const transferVelocityAtInitial = visVivaVelocity(initialRadiusKm, transferSemiMajorKm);
    const transferVelocityAtTarget = visVivaVelocity(targetRadiusKm, transferSemiMajorKm);
    burnOneKmPerSecond = Math.abs(transferVelocityAtInitial - initialCircularVelocity);
    burnTwoKmPerSecond = Math.abs(targetCircularVelocity - transferVelocityAtTarget);
    durationSeconds = Math.PI * Math.sqrt(transferSemiMajorKm ** 3 / SGP4_MU_KM3_PER_SECOND2);
  } else if (input.mode === "planeChange") {
    targetInclinationDegrees = finiteRange(input.targetInclinationDegrees, 0, 180, "target inclination");
    const inclinationChangeRadians = Math.abs(
      targetInclinationDegrees - satellite.inclinationDegrees,
    ) * Math.PI / 180;
    burnOneKmPerSecond = 2 * circularVelocity(initialRadiusKm) * Math.sin(inclinationChangeRadians / 2);
  } else if (input.mode === "phasing") {
    const phaseChangeDegrees = finiteRange(input.phaseChangeDegrees, -180, 180, "phase change");
    const revolutions = finiteRange(input.phasingRevolutions, 1, 10, "phasing revolutions");
    if (!Number.isInteger(revolutions)) throw new Error("phasing revolutions must be an integer");
    const orbitalPeriodSeconds = 86_400 / satellite.meanMotionRevolutionsPerDay;
    const phasingPeriodSeconds = orbitalPeriodSeconds * (1 - phaseChangeDegrees / (360 * revolutions));
    const phasingSemiMajorKm = Math.cbrt(
      SGP4_MU_KM3_PER_SECOND2 * (phasingPeriodSeconds / (2 * Math.PI)) ** 2,
    );
    const otherApsisKm = 2 * phasingSemiMajorKm - initialRadiusKm;
    if (Math.min(initialRadiusKm, otherApsisKm) <= SGP4_EARTH_RADIUS_KM) {
      throw new Error("phasing orbit intersects Earth");
    }
    const phasingVelocity = visVivaVelocity(initialRadiusKm, phasingSemiMajorKm);
    burnOneKmPerSecond = Math.abs(phasingVelocity - circularVelocity(initialRadiusKm));
    burnTwoKmPerSecond = burnOneKmPerSecond;
    durationSeconds = phasingPeriodSeconds * revolutions;
    targetAltitudeKm = phasingSemiMajorKm - SGP4_EARTH_RADIUS_KM;
  } else {
    throw new Error("unsupported mission scenario");
  }

  const totalDeltaVMetersPerSecond = (burnOneKmPerSecond + burnTwoKmPerSecond) * 1_000;
  return {
    burnOneMetersPerSecond: burnOneKmPerSecond * 1_000,
    burnTwoMetersPerSecond: burnTwoKmPerSecond * 1_000,
    durationSeconds,
    initialAltitudeKm,
    initialInclinationDegrees: satellite.inclinationDegrees,
    mode: input.mode,
    propellantMassKg: propellantMass(totalDeltaVMetersPerSecond, input.spacecraftMassKg, input.specificImpulseSeconds),
    targetAltitudeKm,
    targetInclinationDegrees,
    totalDeltaVMetersPerSecond,
  };
}

function circularVelocity(radiusKm: number): number {
  return Math.sqrt(SGP4_MU_KM3_PER_SECOND2 / radiusKm);
}

function visVivaVelocity(radiusKm: number, semiMajorAxis: number): number {
  return Math.sqrt(SGP4_MU_KM3_PER_SECOND2 * (2 / radiusKm - 1 / semiMajorAxis));
}

function propellantMass(deltaVMetersPerSecond: number, massKg: number | null, ispSeconds: number | null): number | null {
  if (massKg === null || ispSeconds === null || massKg <= 0 || ispSeconds <= 0) return null;
  return massKg * (1 - Math.exp(-deltaVMetersPerSecond / (ispSeconds * STANDARD_GRAVITY_METERS_PER_SECOND2)));
}

function finiteRange(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} is outside the supported scenario range`);
  }
  return value;
}
