import type {
  GroundNetworkContactWindow,
  GroundNetworkGap,
  GroundNetworkStationResult,
} from "./analysis";

export function mergeGroundNetworkWindows(
  stationResults: readonly GroundNetworkStationResult[],
): GroundNetworkContactWindow[] {
  const windows = stationResults.flatMap((stationResult) => stationResult.passes.map((pass) => ({
    endUnixMs: pass.losUnixMs,
    startUnixMs: pass.aosUnixMs,
    stationIds: [stationResult.station.id],
  }))).sort((left, right) => left.startUnixMs - right.startUnixMs || left.endUnixMs - right.endUnixMs);
  const merged: GroundNetworkContactWindow[] = [];
  for (const window of windows) {
    const current = merged.length > 0 ? merged[merged.length - 1] : undefined;
    if (!current || window.startUnixMs > current.endUnixMs) {
      merged.push({ ...window });
      continue;
    }
    current.endUnixMs = Math.max(current.endUnixMs, window.endUnixMs);
    current.stationIds = [...new Set([...current.stationIds, ...window.stationIds])];
  }
  return merged;
}

export function calculateGroundNetworkGaps(
  startUnixMs: number,
  endUnixMs: number,
  windows: readonly GroundNetworkContactWindow[],
): GroundNetworkGap[] {
  const gaps: GroundNetworkGap[] = [];
  let cursor = startUnixMs;
  for (const window of windows) {
    if (window.startUnixMs > cursor) {
      gaps.push({
        durationSeconds: (window.startUnixMs - cursor) / 1_000,
        endUnixMs: window.startUnixMs,
        startUnixMs: cursor,
      });
    }
    cursor = Math.max(cursor, window.endUnixMs);
  }
  if (cursor < endUnixMs) {
    gaps.push({ durationSeconds: (endUnixMs - cursor) / 1_000, endUnixMs, startUnixMs: cursor });
  }
  return gaps;
}
