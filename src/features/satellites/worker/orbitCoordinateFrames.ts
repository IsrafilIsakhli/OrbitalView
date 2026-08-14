import { gstime } from "@satellite/propagation";
import { eciToEcf } from "@satellite/transforms";

export interface EciOrbitSample {
  positionKilometers: { x: number; y: number; z: number } | null;
  timestampUnixMs: number;
}

export interface OrbitCoordinateFrames {
  groundTrackPositionsMeters: Float64Array;
  orbitPositionsMeters: Float64Array;
  referenceTimestampUnixMs: number;
}

export function createOrbitCoordinateFrames(
  samples: readonly EciOrbitSample[],
  referenceTimestampUnixMs: number,
): OrbitCoordinateFrames {
  const orbitPositionsMeters = new Float64Array(samples.length * 3);
  const groundTrackPositionsMeters = new Float64Array(samples.length * 3);
  const referenceGmst = gstime(new Date(referenceTimestampUnixMs));
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const offset = index * 3;
    if (!sample?.positionKilometers) {
      orbitPositionsMeters.fill(Number.NaN, offset, offset + 3);
      groundTrackPositionsMeters.fill(Number.NaN, offset, offset + 3);
      continue;
    }
    const orbitEcf = eciToEcf(sample.positionKilometers, referenceGmst);
    const trackEcf = eciToEcf(
      sample.positionKilometers,
      gstime(new Date(sample.timestampUnixMs)),
    );
    orbitPositionsMeters[offset] = orbitEcf.x * 1_000;
    orbitPositionsMeters[offset + 1] = orbitEcf.y * 1_000;
    orbitPositionsMeters[offset + 2] = orbitEcf.z * 1_000;
    groundTrackPositionsMeters[offset] = trackEcf.x * 1_000;
    groundTrackPositionsMeters[offset + 1] = trackEcf.y * 1_000;
    groundTrackPositionsMeters[offset + 2] = trackEcf.z * 1_000;
  }
  return {
    groundTrackPositionsMeters,
    orbitPositionsMeters,
    referenceTimestampUnixMs,
  };
}
