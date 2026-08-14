import { describe, expect, it } from "vitest";

import { formatDateTime, formatRelativeTime } from "./formatters";

describe("localized formatters", () => {
  it("keeps UTC as the primary mission timestamp", () => {
    const result = formatDateTime("2026-08-09T10:30:00+03:00", "tr-TR", "utc-local");
    expect(result.primary).toContain("07:30");
    expect(result.utc).toBe(result.primary);
    expect(result.local).not.toBeNull();
  });

  it("returns a safe value for invalid provider dates", () => {
    expect(formatDateTime("invalid", "en", "utc-only").primary).toBe("—");
  });

  it("formats freshness without changing the underlying epoch", () => {
    expect(formatRelativeTime(30_000, 0, "en")).toContain("30");
  });

  it("supports Intl date/time style presets without mixing component options", () => {
    expect(() => formatDateTime("2026-08-09T07:30:00Z", "en", "utc-only", {
      dateStyle: "medium",
      timeStyle: "short",
    })).not.toThrow();
  });
});
