import { describe, expect, it } from "vitest";

import { classifyLaunchStatus, createSpaceIntelligence, safeHttpsUrl } from "./launch";

describe("Launch Library normalization", () => {
  it("normalizes a production-shaped launch and event", () => {
    const result = createSpaceIntelligence([
      {
        id: "launch-1",
        image: {
          credit: "Space Agency",
          image_url: "https://example.com/rocket.jpg",
          thumbnail_url: "https://example.com/rocket-small.jpg",
        },
        launch_service_provider: {
          abbrev: "OVX",
          name: "Orbital Vision Launch",
          type: "Commercial",
        },
        mission: {
          description: "A real mission description.",
          name: "Aurora",
          orbit: { abbrev: "LEO", name: "Low Earth Orbit" },
          type: "Communications",
          vid_urls: [{ url: "https://example.com/live" }],
        },
        name: "Vector | Aurora",
        net: "2026-08-08T16:24:49Z",
        launch_designator: "2026-101",
        last_updated: "2026-08-07T12:00:00Z",
        url: "https://ll.thespacedevs.com/2.3.0/launches/launch-1/",
        pad: {
          country: { alpha_2_code: "US", name: "United States" },
          latitude: "34.632",
          location: { name: "Vandenberg Space Force Base" },
          longitude: "-120.611",
          name: "Space Launch Complex",
        },
        probability: 90,
        rocket: { configuration: {
          diameter: 3.7,
          full_name: "Vector Block 5",
          length: 70,
          leo_capacity: 22_800,
          manufacturer: { name: "Orbital Vision Launch" },
          name: "Vector",
          successful_launches: 19,
          total_launch_count: 20,
        } },
        status: { abbrev: "Go", id: 1, name: "Go for Launch" },
      },
    ], [
      {
        date: "2026-08-10T12:00:00Z",
        description: "Crew spacewalk",
        id: 42,
        info_urls: [{ url: "https://example.com/event" }],
        location: "International Space Station",
        name: "Expedition EVA",
        type: { name: "EVA" },
      },
    ], {
      eventCount: 1,
      expiresAt: "2026-08-08T00:30:00Z",
      fetchedAt: "2026-08-08T00:00:00Z",
      launchCount: 1,
      source: "Launch Library 2.3 live",
      stale: false,
    });

    expect(result.launches).toHaveLength(1);
    expect(result.launches[0]).toMatchObject({
      agencyName: "Orbital Vision Launch",
      latitude: 34.632,
      longitude: -120.611,
      orbitAbbreviation: "LEO",
      rocketName: "Vector Block 5",
      launchDesignator: "2026-101",
      locationName: "Vandenberg Space Force Base",
      sourceUrl: "https://ll.thespacedevs.com/2.3.0/launches/launch-1/",
      statusId: 1,
      streamUrl: "https://example.com/live",
    });
    expect(result.launches[0]?.rocket).toMatchObject({
      fullName: "Vector Block 5",
      lengthMeters: 70,
      leoCapacityKg: 22_800,
      manufacturerName: "Orbital Vision Launch",
      successfulLaunches: 19,
      totalLaunchCount: 20,
    });
    expect(result.events[0]).toMatchObject({
      id: "event:42",
      infoUrl: "https://example.com/event",
      typeName: "EVA",
    });
    expect(result.rejectedLaunchCount).toBe(0);
  });

  it("rejects unsafe external protocols", () => {
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("http://example.com/live")).toBeNull();
    expect(safeHttpsUrl("https://example.com/live")).toBe("https://example.com/live");
  });

  it("classifies the canonical Launch Library status IDs", () => {
    expect(classifyLaunchStatus(1)).toBe("upcoming");
    expect(classifyLaunchStatus(2)).toBe("upcoming");
    expect(classifyLaunchStatus(5)).toBe("upcoming");
    expect(classifyLaunchStatus(8)).toBe("upcoming");
    expect(classifyLaunchStatus(6)).toBe("active");
    expect(classifyLaunchStatus(3)).toBe("completed");
    expect(classifyLaunchStatus(4)).toBe("completed");
    expect(classifyLaunchStatus(7)).toBe("completed");
    expect(classifyLaunchStatus(9)).toBe("completed");
    expect(classifyLaunchStatus(99)).toBe("unknown");
  });
});
