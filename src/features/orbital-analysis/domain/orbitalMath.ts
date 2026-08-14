import type { AnalysisSatelliteInput, AnalysisWarning, ProximityEvent } from "./analysis";

export const SGP4_MU_KM3_PER_SECOND2 = 398_600.8;
export const SGP4_EARTH_RADIUS_KM = 6_378.135;
export const SPEED_OF_LIGHT_KM_PER_SECOND = 299_792.458;

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export function vectorMagnitude(vector: Vector3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function subtractVectors(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function dotVectors(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function crossVectors(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function scaleVector(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

export function normalizeVector(vector: Vector3): Vector3 | null {
  const magnitude = vectorMagnitude(vector);
  return magnitude > 0 && Number.isFinite(magnitude)
    ? scaleVector(vector, 1 / magnitude)
    : null;
}

export function specificOrbitalEnergy(positionKm: Vector3, velocityKmPerSecond: Vector3): number {
  const radius = vectorMagnitude(positionKm);
  const speed = vectorMagnitude(velocityKmPerSecond);
  return speed * speed / 2 - SGP4_MU_KM3_PER_SECOND2 / radius;
}

export function angularMomentumMagnitude(positionKm: Vector3, velocityKmPerSecond: Vector3): number {
  return vectorMagnitude(crossVectors(positionKm, velocityKmPerSecond));
}

export function semiMajorAxisKm(meanMotionRevolutionsPerDay: number): number {
  const radiansPerSecond = meanMotionRevolutionsPerDay * Math.PI * 2 / 86_400;
  return Math.cbrt(SGP4_MU_KM3_PER_SECOND2 / (radiansPerSecond * radiansPerSecond));
}

export function derivedApsides(record: Pick<AnalysisSatelliteInput, "eccentricity" | "meanMotionRevolutionsPerDay">) {
  const semiMajor = semiMajorAxisKm(record.meanMotionRevolutionsPerDay);
  return {
    apogeeKm: semiMajor * (1 + record.eccentricity) - SGP4_EARTH_RADIUS_KM,
    perigeeKm: semiMajor * (1 - record.eccentricity) - SGP4_EARTH_RADIUS_KM,
  };
}

export function radialEnvelope(record: AnalysisSatelliteInput): { apogeeKm: number; perigeeKm: number } {
  const derived = derivedApsides(record);
  return {
    apogeeKm: Number.isFinite(record.apogeeKm) ? record.apogeeKm! : derived.apogeeKm,
    perigeeKm: Number.isFinite(record.perigeeKm) ? record.perigeeKm! : derived.perigeeKm,
  };
}

export function normalizeLongitudeDegrees(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
}

export function epochWarnings(
  records: readonly Pick<AnalysisSatelliteInput, "epoch" | "id">[],
  nowUnixMs: number,
  stale: boolean,
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = stale ? [{ code: "catalog-stale" }] : [];
  for (const record of records) {
    const epoch = Date.parse(record.epoch);
    if (!Number.isFinite(epoch)) continue;
    const ageDays = Math.abs(nowUnixMs - epoch) / 86_400_000;
    if (ageDays > 14) warnings.push({ code: "element-old", objectId: record.id });
    else if (ageDays > 7) warnings.push({ code: "element-aged", objectId: record.id });
  }
  return warnings;
}

export function classicalDopplerShiftHz(radialVelocityKmPerSecond: number, frequencyHz: number): number {
  return -(radialVelocityKmPerSecond / SPEED_OF_LIGHT_KM_PER_SECOND) * frequencyHz;
}

export function projectRelativePositionToRtn(
  primaryPosition: Vector3,
  primaryVelocity: Vector3,
  relativePosition: Vector3,
): Pick<ProximityEvent, "alongTrackSeparationKm" | "crossTrackSeparationKm" | "radialSeparationKm"> | null {
  const radial = normalizeVector(primaryPosition);
  const normal = normalizeVector(crossVectors(primaryPosition, primaryVelocity));
  if (!radial || !normal) return null;
  const along = normalizeVector(crossVectors(normal, radial));
  if (!along) return null;
  return {
    alongTrackSeparationKm: dotVectors(relativePosition, along),
    crossTrackSeparationKm: dotVectors(relativePosition, normal),
    radialSeparationKm: dotVectors(relativePosition, radial),
  };
}
