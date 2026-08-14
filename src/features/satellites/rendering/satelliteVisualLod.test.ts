import type { OMMJsonObject } from "satellite.js";
import { describe, expect, it } from "vitest";

import {
  satelliteCategories,
  type SatelliteCategory,
  type SatelliteRecord,
} from "../domain/satellite";
import { resolveVisualTier, selectSatellitePresentation } from "./satelliteVisualLod";

const visibility = Object.fromEntries(
  satelliteCategories.map((category) => [category, true]),
) as Record<SatelliteCategory, boolean>;

describe("satellite visual LOD", () => {
  it("returns deterministic real catalog indices inside every quality budget", () => {
    const catalog = Array.from({ length: 1_200 }, (_, index) =>
      satellite(index, satelliteCategories[index % satelliteCategories.length]!),
    );
    const first = selectSatellitePresentation(catalog, "eco", visibility, null);
    const second = selectSatellitePresentation(catalog, "eco", visibility, null);

    expect(first).toEqual(second);
    expect(first.signalIndices.length).toBe(1_200);
    expect(first.semanticIndices.length).toBeLessThanOrEqual(90);
    expect(first.contextOrbitIndices.length).toBeLessThanOrEqual(1);
    expect(first.semanticIndices.every((index) => catalog[index] !== undefined)).toBe(true);
  });

  it("allocates focused semantic markers only to the real focused category", () => {
    const catalog = Array.from({ length: 420 }, (_, index) =>
      satellite(index, index % 2 === 0 ? "starlink" : "debris"),
    );
    const result = selectSatellitePresentation(catalog, "balanced", visibility, "debris");
    expect(result.semanticIndices.length).toBeLessThanOrEqual(160);
    expect(result.semanticIndices.every((index) => catalog[index]?.category === "debris")).toBe(true);
  });

  it("uses hysteresis between global, orbital and inspection tiers", () => {
    expect(resolveVisualTier(13_000_000, "global")).toBe("global");
    expect(resolveVisualTier(10_000_000, "global")).toBe("orbital");
    expect(resolveVisualTier(7_200_000, "orbital")).toBe("inspection");
    expect(resolveVisualTier(7_600_000, "inspection")).toBe("inspection");
  });
});

function satellite(index: number, category: SatelliteCategory): SatelliteRecord {
  return {
    apogeeKm: 500 + (index % 12) * 300,
    argumentOfPerigeeDegrees: (index * 11) % 360,
    category,
    eccentricity: 0.001,
    epoch: "2026-01-01T00:00:00Z",
    id: `norad:${index}`,
    inclinationDegrees: (index * 7) % 100,
    internationalDesignator: `2026-${index}`,
    launchDate: null,
    launchSiteCode: null,
    meanAnomalyDegrees: (index * 17) % 360,
    meanMotionRevolutionsPerDay: 15,
    name: `${category}-${index}`,
    noradId: String(index),
    objectType: null,
    omm: {} as OMMJsonObject,
    operationalStatusCode: null,
    ownerCode: null,
    perigeeKm: 480 + (index % 12) * 300,
    periodMinutes: 96,
    rightAscensionDegrees: (index * 23) % 360,
  };
}
