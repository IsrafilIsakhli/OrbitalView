import { describe, expect, it } from "vitest";

import { calculateLaunchCountdown } from "./countdown";
import { launchStatusIds } from "./launch";

describe("launch countdown", () => {
  const target = "2026-08-09T10:00:00+03:00";
  const targetUnixMs = Date.parse(target);

  it("transitions across T-0 without freezing at zero", () => {
    expect(calculateLaunchCountdown(target, launchStatusIds.go, targetUnixMs - 1_000).phase).toBe("counting");
    expect(calculateLaunchCountdown(target, launchStatusIds.go, targetUnixMs + 1_000).phase).toBe("awaiting");
    expect(calculateLaunchCountdown(target, launchStatusIds.inFlight, targetUnixMs + 1_000).phase).toBe("in-flight");
  });

  it("uses the timestamp epoch instead of the display timezone", () => {
    expect(calculateLaunchCountdown(target, launchStatusIds.go, targetUnixMs - 3_600_000).hours).toBe(1);
  });

  it("handles invalid provider dates safely", () => {
    expect(calculateLaunchCountdown("not-a-date", null).phase).toBe("invalid");
  });
});
