import { describe, expect, it } from "vitest";

import type { LaunchRecord } from "./launch";
import {
  createLaunchQueues,
  filterLaunchTimeline,
  launchStatusTranslationKey,
  selectNextLaunch,
} from "./launchPresentation";

function record(id: string, statusId: number | null, net: string): LaunchRecord {
  return {
    agencyAbbreviation: null, agencyName: null, agencyType: null, countryCode: null,
    countryName: null, id, image: null, lastUpdated: null, latitude: null,
    launchDesignator: null, locationName: null, longitude: null,
    missionDescription: null, missionName: id, missionType: null, name: id, net,
    orbitAbbreviation: null, orbitName: null, padId: null, padMapUrl: null,
    padName: null, payloadNames: [], probability: null, programNames: [],
    rocket: null, rocketName: null, sourceUrl: null, statusAbbreviation: null,
    statusDescription: null, statusId, statusName: null, streamUrl: null,
    webcastLive: false, weatherConcerns: null, windowEnd: null, windowStart: null,
  };
}

describe("launch presentation", () => {
  it("never presents completed records as upcoming", () => {
    const queues = createLaunchQueues([
      record("success", 3, "2026-08-11T10:00:00Z"),
      record("next", 1, "2026-08-12T10:00:00Z"),
      record("active", 6, "2026-08-12T09:00:00Z"),
    ]);
    expect(queues.upcoming.map(({ id }) => id)).toEqual(["next"]);
    expect(queues.active.map(({ id }) => id)).toEqual(["active"]);
    expect(queues.completed.map(({ id }) => id)).toEqual(["success"]);
  });

  it("selects the earliest future record before overdue awaiting updates", () => {
    const records = [
      record("overdue", 1, "2026-08-11T10:00:00Z"),
      record("future", 1, "2026-08-13T10:00:00Z"),
    ];
    expect(selectNextLaunch(records, Date.parse("2026-08-12T10:00:00Z"))?.id).toBe("future");
  });

  it("keeps a just-opened launch window in operational focus while status catches up", () => {
    const records = [
      record("just-opened", 1, "2026-08-12T09:30:00Z"),
      record("future", 1, "2026-08-13T10:00:00Z"),
    ];
    expect(selectNextLaunch(records, Date.parse("2026-08-12T10:00:00Z"))?.id).toBe("just-opened");
  });

  it("filters bounded ranges and searchable real fields", () => {
    const records = [
      { ...record("falcon", 1, "2026-08-15T10:00:00Z"), agencyName: "SpaceX" },
      record("long", 1, "2026-09-20T10:00:00Z"),
    ];
    expect(filterLaunchTimeline(records, {
      nowUnixMs: Date.parse("2026-08-12T10:00:00Z"), query: "SpaceX", range: "sevenDays", tab: "upcoming",
    }).map(({ id }) => id)).toEqual(["falcon"]);
  });

  it("searches provider-supplied orbit, payload and program fields", () => {
    const records = [
      {
        ...record("science", 1, "2026-08-15T10:00:00Z"),
        orbitName: "Sun-Synchronous Orbit",
        payloadNames: ["Earth Observer 4"],
        programNames: ["Climate Watch"],
      },
    ];
    const options = {
      nowUnixMs: Date.parse("2026-08-12T10:00:00Z"),
      range: "all" as const,
      tab: "upcoming" as const,
    };
    expect(filterLaunchTimeline(records, { ...options, query: "observer" })).toHaveLength(1);
    expect(filterLaunchTimeline(records, { ...options, query: "climate" })).toHaveLength(1);
    expect(filterLaunchTimeline(records, { ...options, query: "synchronous" })).toHaveLength(1);
  });

  it("maps all canonical LL2 status identifiers", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(launchStatusTranslationKey)).toEqual([
      "go", "tbd", "success", "failure", "hold", "inFlight", "partialFailure", "tbc", "deployed",
    ]);
  });
});
