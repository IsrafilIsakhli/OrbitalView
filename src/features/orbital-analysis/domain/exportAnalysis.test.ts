import { describe, expect, it } from "vitest";

import type { AnalysisEnvelope, DynamicsResult } from "./analysis";
import { analysisToCsv, analysisToJson } from "./exportAnalysis";

const fixture: AnalysisEnvelope<DynamicsResult> = {
  catalogFetchedAtUnixMs: 1,
  frame: "SGP4-ECI",
  generatedAtUnixMs: 2,
  model: "SGP4",
  objectEpochs: { "norad:25544": 1 },
  requestId: "test",
  result: {
    derivedApogeeKm: 420,
    derivedPerigeeKm: 410,
    invalidSampleCount: 0,
    samples: [{
      altitudeKm: 420,
      angularMomentumKm2PerSecond: 52_000,
      latitudeDegrees: 1,
      longitudeDegrees: 2,
      radiusKm: 6_798,
      specificEnergyKm2PerSecond2: -29,
      timestampUnixMs: 10,
      velocityKmPerSecond: 7.6,
    }],
    satelliteId: "norad:25544",
  },
  stale: false,
  warnings: [],
};

describe("analysis export", () => {
  it("keeps the full provenance contract in JSON", () => {
    const parsed = JSON.parse(analysisToJson(fixture)) as AnalysisEnvelope<DynamicsResult>;
    expect(parsed.model).toBe("SGP4");
    expect(parsed.frame).toBe("SGP4-ECI");
    expect(parsed.result.samples).toHaveLength(1);
  });

  it("exports dynamics samples as CSV", () => {
    const csv = analysisToCsv(fixture);
    expect(csv).toContain("timestampUnixMs");
    expect(csv).toContain("velocityKmPerSecond");
    expect(csv).toContain("420");
  });
});
