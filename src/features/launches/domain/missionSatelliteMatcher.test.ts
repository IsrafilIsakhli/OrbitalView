import { describe, expect, it } from "vitest";

import type { SatelliteRecord } from "@/features/satellites/domain/satellite";

import { matchMissionSatellites } from "./missionSatelliteMatcher";

function satellite(id: string, designator: string, objectType: string): SatelliteRecord {
  return {
    apogeeKm: null,
    argumentOfPerigeeDegrees: 0,
    category: objectType === "PAYLOAD" ? "other" : "rocket-body",
    eccentricity: 0,
    epoch: "2026-08-09T00:00:00Z",
    id: `norad:${id}`,
    inclinationDegrees: 0,
    internationalDesignator: designator,
    launchDate: null,
    launchSiteCode: null,
    meanAnomalyDegrees: 0,
    meanMotionRevolutionsPerDay: 15,
    name: designator,
    noradId: id,
    objectType,
    omm: {} as SatelliteRecord["omm"],
    operationalStatusCode: null,
    ownerCode: null,
    perigeeKm: null,
    periodMinutes: 96,
    rightAscensionDegrees: 0,
  };
}

describe("mission satellite matching", () => {
  it("matches only the exact international launch designator", () => {
    const matches = matchMissionSatellites("2026-021", [
      satellite("1", "2026-021B", "ROCKET BODY"),
      satellite("2", "2026-021A", "PAYLOAD"),
      satellite("3", "2025-021A", "PAYLOAD"),
      satellite("4", "2026-210A", "PAYLOAD"),
    ]);
    expect(matches.map((match) => match.satellite.noradId)).toEqual(["2", "1"]);
    expect(matches[0]?.isPrimary).toBe(true);
  });

  it("does not use names when the provider designator is unavailable", () => {
    expect(matchMissionSatellites(null, [satellite("1", "2026-021A", "PAYLOAD")])).toEqual([]);
  });
});
