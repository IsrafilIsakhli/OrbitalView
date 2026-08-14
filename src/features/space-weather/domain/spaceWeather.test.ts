import { describe, expect, it } from "vitest";

import type { NoaaSpaceWeather } from "./spaceWeather";
import { currentScale, latestKp } from "./spaceWeather";

function payload(): NoaaSpaceWeather {
  return {
    alerts: [],
    durationMs: 15,
    errorCode: null,
    expiresAtUnixMs: 2_000,
    fetchedAtUnixMs: 1_000,
    kpSamples: [
      { aRunning: 4, kp: 2.1, observedAtUnixMs: 900, stationCount: 8 },
      { aRunning: 12, kp: 4.67, observedAtUnixMs: 1_000, stationCount: 8 },
    ],
    retryCount: 0,
    scales: [
      {
        forecastDay: 0,
        level: 2,
        majorProbabilityPercent: null,
        minorProbabilityPercent: null,
        probabilityPercent: null,
        scaleType: "geomagneticStorm",
        text: "Moderate",
        validAtUnixMs: 1_000,
      },
      {
        forecastDay: 1,
        level: 3,
        majorProbabilityPercent: null,
        minorProbabilityPercent: null,
        probabilityPercent: null,
        scaleType: "geomagneticStorm",
        text: "Strong",
        validAtUnixMs: 2_000,
      },
    ],
    solarWind: null,
    source: "NOAA Space Weather Prediction Center",
    sourceUrl: "https://www.swpc.noaa.gov",
    stale: false,
    status: "fresh",
  };
}

describe("space weather selectors", () => {
  it("returns only the current official scale reading", () => {
    expect(currentScale(payload(), "geomagneticStorm")?.level).toBe(2);
    expect(currentScale(payload(), "radioBlackout")).toBeNull();
  });

  it("returns the latest provider-ordered Kp sample without synthesizing a value", () => {
    expect(latestKp(payload())?.kp).toBe(4.67);
    expect(latestKp({ ...payload(), kpSamples: [] })).toBeNull();
  });
});
