import { describe, expect, it } from "vitest";

import {
  createNasaIntelligence,
  safeHttpsUrl,
  type NasaComponentInput,
  type NasaIntelligenceInput,
  type ProviderStatus,
} from "./nasa";

const NOW = Date.parse("2026-08-07T20:00:00.000Z");

function component(
  data: unknown,
  request: string,
  status: ProviderStatus = "fresh",
): NasaComponentInput {
  return {
    data,
    diagnostics: {
      cacheHit: false,
      durationMs: 120,
      errorType: status === "unavailable" ? "network" : null,
      provider: "NASA Open APIs",
      request,
      retryCount: 0,
      status,
    },
    expiresAtUnixMs: status === "unavailable" ? 0 : NOW + 3_600_000,
    fetchedAtUnixMs: status === "unavailable" ? 0 : NOW,
    rateLimitRemaining: 990,
    source: "NASA Open APIs",
    stale: status === "stale",
    status,
  };
}

function input(overrides: Partial<NasaIntelligenceInput> = {}): NasaIntelligenceInput {
  return {
    apiKeyConfigured: true,
    apod: component({
      copyright: "NASA",
      date: "2026-08-07",
      explanation: "A deep-field observation.",
      hdurl: "https://apod.nasa.gov/apod/image/2608/example_hd.jpg",
      media_type: "image",
      title: "Deep Field",
      url: "https://apod.nasa.gov/apod/image/2608/example.jpg",
    }, "apod"),
    cmes: component([{
      activityID: "2026-08-07T10:00:00-CME-001",
      cmeAnalyses: [{ isMostAccurate: true, speed: 750 }],
      link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/CME/1",
      note: "Earth-directed analysis is under review.",
      sourceLocation: "N12E04",
      startTime: "2026-08-07T10:00Z",
    }], "cme"),
    flares: component([{
      beginTime: "2026-08-07T12:00Z",
      classType: "M2.1",
      flrID: "2026-08-07T12:00:00-FLR-001",
      link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/1",
      sourceLocation: "N12E04",
    }], "flare"),
    neo: component({
      near_earth_objects: {
        "2026-08-08": [{
          absolute_magnitude_h: 22.3,
          close_approach_data: [{
            close_approach_date: "2026-08-08",
            close_approach_date_full: "2026-Aug-08 14:30",
            miss_distance: { kilometers: "1800000", lunar: "4.68" },
            orbiting_body: "Earth",
            relative_velocity: { kilometers_per_second: "12.5" },
          }],
          estimated_diameter: {
            kilometers: {
              estimated_diameter_max: 0.12,
              estimated_diameter_min: 0.05,
            },
          },
          id: "12345",
          is_potentially_hazardous_asteroid: false,
          name: "(2026 AB)",
          nasa_jpl_url: "https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=12345",
        }],
      },
    }, "neo-feed"),
    retrievedAtUnixMs: NOW,
    storms: component([{
      allKpIndex: [{ kpIndex: 6.3, observedTime: "2026-08-07T16:00Z" }],
      gstID: "2026-08-07T14:00:00-GST-001",
      link: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/GST/1",
      startTime: "2026-08-07T14:00Z",
    }], "storm"),
    ...overrides,
  };
}

describe("createNasaIntelligence", () => {
  it("validates and normalizes APOD, NeoWs, and DONKI records", () => {
    const intelligence = createNasaIntelligence(input());

    expect(intelligence.apod?.title).toBe("Deep Field");
    expect(intelligence.approaches).toHaveLength(1);
    expect(intelligence.approaches[0]).toMatchObject({
      id: "12345",
      missDistanceKm: 1_800_000,
      potentiallyHazardous: false,
      relativeVelocityKps: 12.5,
      source: "NASA Open APIs",
    });
    expect(intelligence.spaceWeatherEvents.map((event) => event.eventType).sort())
      .toEqual(["cme", "flare", "storm"]);
    expect(intelligence.spaceWeatherEvents.find((event) => event.eventType === "storm")?.magnitudeLabel)
      .toBe("Kp 6.3");
    expect(intelligence.rejectedRecordCount).toBe(0);
    expect(intelligence.overallStatus).toBe("fresh");
  });

  it("keeps valid records when adjacent provider records are malformed", () => {
    const intelligence = createNasaIntelligence(input({
      cmes: component([{ activityID: "missing-start-time" }], "cme"),
      neo: component({ near_earth_objects: { "2026-08-08": [{ id: "broken" }] } }, "neo-feed"),
    }));

    expect(intelligence.apod).not.toBeNull();
    expect(intelligence.approaches).toHaveLength(0);
    expect(intelligence.spaceWeatherEvents).toHaveLength(2);
    expect(intelligence.rejectedRecordCount).toBe(2);
  });

  it("accepts authoritative empty NeoWs and DONKI result sets", () => {
    const intelligence = createNasaIntelligence(input({
      cmes: component([], "cme"),
      flares: component([], "flare"),
      neo: component({ near_earth_objects: {} }, "neo-feed"),
      storms: component([], "storm"),
    }));

    expect(intelligence.approaches).toEqual([]);
    expect(intelligence.spaceWeatherEvents).toEqual([]);
    expect(intelligence.rejectedRecordCount).toBe(0);
  });

  it("reports degraded state and preserves stale provenance", () => {
    const intelligence = createNasaIntelligence(input({
      cmes: component([], "cme", "unavailable"),
      neo: component({ near_earth_objects: {} }, "neo-feed", "stale"),
    }));

    expect(intelligence.overallStatus).toBe("degraded");
    expect(intelligence.components.neo.stale).toBe(true);
    expect(intelligence.components.cmes.diagnostics.errorType).toBe("network");
  });
});

describe("safeHttpsUrl", () => {
  it("rejects malformed and non-HTTPS external links", () => {
    expect(safeHttpsUrl("https://nasa.gov/path")).toBe("https://nasa.gov/path");
    expect(safeHttpsUrl("http://nasa.gov/path")).toBeNull();
    expect(safeHttpsUrl("not a url")).toBeNull();
  });
});
