import type { CoveragePass, CoverageResult } from "./analysis";

export function mergeCoverageWindows(passes: readonly CoveragePass[]): CoverageResult["windows"] {
  const sorted = passes
    .map((pass) => ({
      endUnixMs: pass.losUnixMs,
      satelliteIds: [pass.satelliteId],
      startUnixMs: pass.aosUnixMs,
    }))
    .sort((left, right) => left.startUnixMs - right.startUnixMs);
  const windows: CoverageResult["windows"] = [];
  for (const next of sorted) {
    const current = windows.length > 0 ? windows[windows.length - 1] : undefined;
    if (!current || next.startUnixMs > current.endUnixMs) {
      windows.push(next);
      continue;
    }
    current.endUnixMs = Math.max(current.endUnixMs, next.endUnixMs);
    current.satelliteIds = [...new Set([...current.satelliteIds, ...next.satelliteIds])];
  }
  return windows;
}

export function calculateCoverageGaps(
  startUnixMs: number,
  endUnixMs: number,
  windows: CoverageResult["windows"],
): CoverageResult["revisitGaps"] {
  const gaps: CoverageResult["revisitGaps"] = [];
  let cursor = startUnixMs;
  for (const window of windows) {
    if (window.startUnixMs > cursor) {
      gaps.push({
        kind: cursor === startUnixMs ? "leading" : "between-passes",
        durationSeconds: (window.startUnixMs - cursor) / 1_000,
        endUnixMs: window.startUnixMs,
        startUnixMs: cursor,
      });
    }
    cursor = Math.max(cursor, window.endUnixMs);
  }
  if (cursor < endUnixMs) {
    gaps.push({
      kind: cursor === startUnixMs ? "no-access" : "trailing",
      durationSeconds: (endUnixMs - cursor) / 1_000,
      endUnixMs,
      startUnixMs: cursor,
    });
  }
  return gaps;
}

export function solarElevationDegrees(
  latitudeDegrees: number,
  longitudeDegrees: number,
  timestampUnixMs: number,
): number {
  const julianDay = timestampUnixMs / 86_400_000 + 2_440_587.5;
  const centuries = (julianDay - 2_451_545) / 36_525;
  const meanLongitude = (280.46646 + centuries * (36_000.76983 + centuries * 0.0003032)) % 360;
  const meanAnomaly = (357.52911 + centuries * (35_999.05029 - 0.0001537 * centuries)) * Math.PI / 180;
  const equationOfCenter = (1.914602 - centuries * (0.004817 + 0.000014 * centuries)) * Math.sin(meanAnomaly)
    + (0.019993 - 0.000101 * centuries) * Math.sin(2 * meanAnomaly)
    + 0.000289 * Math.sin(3 * meanAnomaly);
  const trueLongitude = (meanLongitude + equationOfCenter) * Math.PI / 180;
  const obliquity = (23.439291 - 0.0130042 * centuries) * Math.PI / 180;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(trueLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(trueLongitude),
    Math.cos(trueLongitude),
  );
  const greenwichSiderealDegrees = (
    280.46061837 + 360.98564736629 * (julianDay - 2_451_545)
  ) % 360;
  const localSiderealRadians = (greenwichSiderealDegrees + longitudeDegrees) * Math.PI / 180;
  const hourAngle = localSiderealRadians - rightAscension;
  const latitude = latitudeDegrees * Math.PI / 180;
  return Math.asin(
    Math.sin(latitude) * Math.sin(declination)
      + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  ) * 180 / Math.PI;
}
