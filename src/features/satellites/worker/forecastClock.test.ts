import { describe, expect, it } from "vitest";

import { resolveForecastTimestamp } from "./forecastClock";

describe("forecast clock", () => {
  it("uses wall time outside forecast mode", () => {
    expect(resolveForecastTimestamp(null, 1_000, 2_000)).toBe(2_000);
  });

  it("holds a paused forecast at its selected timestamp", () => {
    expect(resolveForecastTimestamp({
      playing: false,
      rate: 60,
      timestampUnixMs: 10_000,
    }, 1_000, 5_000)).toBe(10_000);
  });

  it("advances a playing forecast by the selected rate", () => {
    expect(resolveForecastTimestamp({
      playing: true,
      rate: 60,
      timestampUnixMs: 10_000,
    }, 1_000, 3_000)).toBe(130_000);
  });
});

