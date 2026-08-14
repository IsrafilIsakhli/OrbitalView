import { describe, expect, it } from "vitest";

import type { LaunchRecord } from "./launch";
import { createLaunchSites, findLaunchSite } from "./launchSite";

describe("launch-site aggregation", () => {
  it("groups real launches at the same coordinates and keeps chronological order", () => {
    const later = launch({ id: "later", name: "Later mission", net: "2026-09-02T10:00:00Z" });
    const next = launch({ id: "next", name: "Next mission", net: "2026-08-20T10:00:00Z" });
    const sites = createLaunchSites([later, next]);

    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      name: "Cape Test Range",
      padNames: ["Pad 4"],
      providerNames: ["Test Launch Provider"],
    });
    expect(sites[0]?.launches.map((item) => item.id)).toEqual(["next", "later"]);
    expect(findLaunchSite(sites, "later")?.id).toBe(sites[0]?.id);
  });

  it("does not create a map site for launches without published coordinates", () => {
    expect(createLaunchSites([
      { ...launch({ id: "unknown", name: "Unknown site", net: "2026-09-02T10:00:00Z" }), latitude: null },
    ])).toEqual([]);
  });
});

function launch(overrides: Pick<LaunchRecord, "id" | "name" | "net">): LaunchRecord {
  return {
    agencyAbbreviation: "TLP",
    agencyName: "Test Launch Provider",
    agencyType: "Commercial",
    countryCode: "US",
    countryName: "United States",
    image: null,
    lastUpdated: null,
    latitude: 28.5,
    launchDesignator: null,
    locationName: "Cape Test Range",
    longitude: -80.5,
    missionDescription: null,
    missionName: null,
    missionType: null,
    orbitAbbreviation: null,
    orbitName: null,
    padId: "4",
    padMapUrl: null,
    padName: "Pad 4",
    payloadNames: [],
    probability: null,
    programNames: [],
    rocket: null,
    rocketName: null,
    sourceUrl: null,
    statusAbbreviation: null,
    statusDescription: null,
    statusId: null,
    statusName: null,
    streamUrl: null,
    webcastLive: false,
    weatherConcerns: null,
    windowEnd: null,
    windowStart: null,
    ...overrides,
  };
}
