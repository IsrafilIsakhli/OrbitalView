import { describe, expect, it } from "vitest";

import {
  TIME_LENS_HORIZON_MS,
  clampTimeLensTimestamp,
  nextTimeLensEvent,
  timeLensProgress,
} from "./orbitalTimeLens";

describe("orbital time lens", () => {
  const start = Date.UTC(2026, 7, 28, 12);

  it("keeps forecast time inside the 24 hour window", () => {
    expect(clampTimeLensTimestamp(start - 1, start)).toBe(start);
    expect(clampTimeLensTimestamp(start + TIME_LENS_HORIZON_MS + 1, start))
      .toBe(start + TIME_LENS_HORIZON_MS);
  });

  it("maps the forecast window to stable progress", () => {
    expect(timeLensProgress(start, start)).toBe(0);
    expect(timeLensProgress(start + TIME_LENS_HORIZON_MS / 2, start)).toBe(0.5);
    expect(timeLensProgress(start + TIME_LENS_HORIZON_MS, start)).toBe(1);
  });

  it("selects the next chronological real event", () => {
    const next = nextTimeLensEvent([
      { id: "later", label: "Later", timestampUnixMs: start + 30_000 },
      { id: "past", label: "Past", timestampUnixMs: start - 1 },
      { id: "next", label: "Next", timestampUnixMs: start + 10_000 },
    ], start);
    expect(next?.id).toBe("next");
  });
});

