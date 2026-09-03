import { expect, it } from "vitest";
import type { ProximityEvent } from "./analysis";
import { deduplicateProximityEvents } from "./proximityEvents";
const event = (tcaUnixMs: number, missDistanceKm: number, secondaryId = "B"): ProximityEvent => ({
  primaryId: "A", secondaryId, tcaUnixMs, missDistanceKm, primaryEpochUnixMs: 1, secondaryEpochUnixMs: 1,
  relativeVelocityKmPerSecond: 10, radialSeparationKm: 1, alongTrackSeparationKm: 2, crossTrackSeparationKm: 3,
});
it("preserves separate approaches while merging duplicate local refinements and excluding self", () => {
  expect(deduplicateProximityEvents([event(10_000, 3), event(10_400, 2), event(90 * 60_000, 5), event(15_000, 1, "A")], "A"))
    .toEqual([event(10_400, 2), event(90 * 60_000, 5)]);
});
