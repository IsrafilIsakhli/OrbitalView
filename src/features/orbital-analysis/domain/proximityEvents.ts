import type { ProximityEvent } from "./analysis";

/** Merge repeat estimates of one local minimum, not separate passes of the same object. */
export function deduplicateProximityEvents(events: readonly ProximityEvent[], primaryId: string, toleranceMs = 1_000): ProximityEvent[] {
  const sorted = events.filter((event) => event.primaryId === primaryId && event.secondaryId !== primaryId
    && Number.isFinite(event.tcaUnixMs) && Number.isFinite(event.missDistanceKm) && event.missDistanceKm >= 0)
    .sort((a, b) => a.secondaryId.localeCompare(b.secondaryId) || a.tcaUnixMs - b.tcaUnixMs);
  const result: ProximityEvent[] = [];
  for (const event of sorted) {
    const last = result[result.length - 1];
    if (last?.secondaryId === event.secondaryId && Math.abs(last.tcaUnixMs - event.tcaUnixMs) <= toleranceMs) {
      if (event.missDistanceKm < last.missDistanceKm) result[result.length - 1] = event;
    } else result.push(event);
  }
  return result.sort((a, b) => a.missDistanceKm - b.missDistanceKm || a.tcaUnixMs - b.tcaUnixMs);
}
