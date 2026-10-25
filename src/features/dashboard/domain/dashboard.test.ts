import { describe, expect, it } from "vitest";

import type { LaunchRecord } from "@/features/launches/domain/launch";
import type { NoaaSpaceWeather } from "@/features/space-weather/domain/spaceWeather";

import {
  dashboardLaunchSupportingLabel,
  dashboardMissionName,
  displayableNoaaText,
  recentOperationalAlerts,
  selectDashboardLaunches,
} from "./dashboard";

describe("dashboard real-data selection", () => {
  it("never presents a completed launch as the next launch", () => {
    const now = Date.parse("2026-08-12T02:00:00Z");
    const completed = launch("completed", "2026-08-11T15:58:26Z", 3);
    const upcoming = launch("upcoming", "2026-08-12T04:46:00Z", 1);
    const result = selectDashboardLaunches([completed, upcoming], now);
    expect(result.nextLaunch?.id).toBe("upcoming");
    expect(result.upcomingLaunches).toHaveLength(1);
  });

  it("keeps a recently elapsed scheduled launch while its canonical status awaits an update", () => {
    const now = Date.parse("2026-08-12T05:00:00Z");
    const awaiting = launch("awaiting", "2026-08-12T04:46:00Z", 1);
    expect(selectDashboardLaunches([awaiting], now).nextLaunch?.id).toBe("awaiting");
  });

  it("does not render NOAA's technical none sentinel", () => {
    expect(displayableNoaaText("none")).toBeNull();
    expect(displayableNoaaText("  Moderate  ")).toBe("Moderate");
  });

  it("counts only recent operational NOAA notices", () => {
    const now = Date.parse("2026-08-12T05:00:00Z");
    const data = {
      alerts: [
        alert("recent", "alert", now - 60_000),
        alert("summary", "summary", now - 60_000),
        alert("old", "warning", now - 25 * 60 * 60_000),
      ],
    } as NoaaSpaceWeather;
    expect(recentOperationalAlerts(data, now).map((item) => item.productId)).toEqual(["recent"]);
  });

  it("does not promote provider placeholder text as mission intelligence", () => {
    const record = {
      ...launch("unknown", "2026-09-09T09:00:00Z", 1),
      missionName: "Unknown Payload",
      name: "Long March 2D/YZ-3 | Unknown Payload",
      rocketName: "Long March 2D/YZ-3",
    };
    expect(dashboardMissionName(record)).toBe(record.name);
    expect(dashboardLaunchSupportingLabel(record)).toBeNull();
  });

  it("keeps distinct real mission metadata supplied by the provider", () => {
    const record = {
      ...launch("real", "2026-09-09T09:00:00Z", 1),
      missionName: "Earth observation deployment",
      name: "Long March 2D",
      rocketName: "Long March 2D",
    };
    expect(dashboardMissionName(record)).toBe("Earth observation deployment");
    expect(dashboardLaunchSupportingLabel(record)).toBe("Earth observation deployment");
  });
});

function launch(id: string, net: string, statusId: number): LaunchRecord {
  return { id, net, statusId } as LaunchRecord;
}

function alert(
  productId: string,
  alertKind: "alert" | "warning" | "summary",
  issuedAtUnixMs: number,
) {
  return {
    alertKind,
    headline: productId,
    issuedAtUnixMs,
    message: productId,
    productId,
    scaleLevel: null,
    scaleType: null,
  };
}
