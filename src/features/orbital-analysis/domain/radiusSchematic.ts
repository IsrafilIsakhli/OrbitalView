import type { DynamicsSample } from "./analysis";
import { SGP4_EARTH_RADIUS_KM } from "./orbitalMath";

/** Integrate angular speed h/r² in the orbital plane; sample count is not phase. */
export function radiusSchematic(samples: readonly DynamicsSample[]) {
  let angle = -Math.PI / 2;
  let maxRadiusKm = SGP4_EARTH_RADIUS_KM;
  const points = samples.map((sample, index) => {
    const previous = samples[index - 1];
    if (previous) {
      const seconds = Math.max(0, (sample.timestampUnixMs - previous.timestampUnixMs) / 1_000);
      const speed = sample.angularMomentumKm2PerSecond / sample.radiusKm ** 2;
      const priorSpeed = previous.angularMomentumKm2PerSecond / previous.radiusKm ** 2;
      if (Number.isFinite(speed + priorSpeed)) angle += seconds * (speed + priorSpeed) / 2;
    }
    const radiusKm = Number.isFinite(sample.radiusKm) ? Math.max(0, sample.radiusKm) : 0;
    maxRadiusKm = Math.max(maxRadiusKm, radiusKm);
    return { x: Math.cos(angle) * radiusKm, y: Math.sin(angle) * radiusKm };
  });
  return { points, maxRadiusKm };
}
