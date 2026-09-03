import { describe, expect, it } from "vitest";

import type { AnalysisEnvelope, CoverageResult, DynamicsResult, GroundNetworkResult } from "./analysis";
import { analysisToCsv, analysisToJson } from "./exportAnalysis";

const fixture: AnalysisEnvelope<DynamicsResult> = {
  context: { kind: "dynamics", objectIds: ["norad:25544"], catalogVersion: "CelesTrak:1", catalogSource: "CelesTrak", parameters: {}, sourceObjects: [], startUnixMs: 10, endUnixMs: 20 },
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
  it("keeps CSV provenance and prevents spreadsheet formula execution", () => {
    const csv = analysisToCsv({ ...fixture, context: { ...fixture.context, catalogSource: "=HYPERLINK(\"https://example.com\")" } });
    expect(csv).toContain("catalogVersion");
    expect(csv).toContain("objectEpochs");
    expect(csv).toContain("'=HYPERLINK");
  });
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

  it("writes large catalog provenance once, not once for every measurement", () => {
    const large = { ...fixture, objectEpochs: Object.fromEntries(Array.from({ length: 16000 }, (_, i) => [`norad:${i}`, 1000])),
      result: { ...fixture.result, samples: Array.from({ length: 1440 }, () => fixture.result.samples[0]!) } };
    const csv = analysisToCsv(large);
    expect(csv.match(/norad:15999/g)).toHaveLength(1);
    expect(csv.length).toBeLessThan(1_000_000);
    expect(csv).toContain("analysis-metadata");
    expect(csv).toContain("measurement");
  });

  it("exports network passes with their real station identity", () => {
    const network: AnalysisEnvelope<GroundNetworkResult> = {
      ...fixture,
      frame: "ECF",
      result: {
        availabilityPercent: 10,
        contactWindows: [],
        endUnixMs: 20_000,
        gaps: [],
        longestGapSeconds: 10,
        satelliteId: "norad:25544",
        startUnixMs: 0,
        stationResults: [{
          invalidSampleCount: 0,
          passes: [{
            aosAzimuthDegrees: 10,
            aosUnixMs: 1_000,
            continuous: false,
            durationSeconds: 10,
            losAzimuthDegrees: 20,
            losUnixMs: 11_000,
            maximumElevationDegrees: 60,
            minimumRangeKm: 420,
            samples: [],
            tcaUnixMs: 6_000,
          }],
          station: {
            altitudeMeters: 0,
            downlinkFrequencyHz: null,
            id: "baku",
            latitudeDegrees: 40.4093,
            longitudeDegrees: 49.8671,
            minimumElevationDegrees: 10,
            name: "Baku GS",
          },
        }],
        totalContactSeconds: 10,
      },
    };
    const csv = analysisToCsv(network);
    expect(csv).toContain("stationName");
    expect(csv).toContain("Baku GS");
    expect(csv).toContain("tcaUnixMs");
  });

  it("exports target access with object and solar-light context", () => {
    const coverage: AnalysisEnvelope<CoverageResult> = {
      ...fixture,
      frame: "ECF",
      result: {
        availabilityPercent: 1,
        endUnixMs: 20_000,
        invalidSampleCount: 0,
        longestRevisitSeconds: 10,
        passes: [{
          aosAzimuthDegrees: 10,
          aosUnixMs: 1_000,
          continuous: false,
          durationSeconds: 10,
          lighting: "day",
          losAzimuthDegrees: 20,
          losUnixMs: 11_000,
          maximumElevationDegrees: 60,
          minimumRangeKm: 420,
          samples: [],
          satelliteId: "norad:25544",
          satelliteName: "ISS (ZARYA)",
          sunElevationDegrees: 25,
          tcaUnixMs: 6_000,
        }],
        revisitGaps: [],
        satelliteIds: ["norad:25544"],
        startUnixMs: 0,
        target: {
          altitudeMeters: 28,
          latitudeDegrees: 40.4093,
          longitudeDegrees: 49.8671,
          minimumElevationDegrees: 10,
          name: "Baku",
        },
        windows: [],
      },
    };
    const csv = analysisToCsv(coverage);
    expect(csv).toContain("satelliteName");
    expect(csv).toContain("ISS (ZARYA)");
    expect(csv).toContain("sunElevationDegrees");
  });
});
