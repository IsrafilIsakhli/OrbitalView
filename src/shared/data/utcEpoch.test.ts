import { describe, expect, it } from "vitest";
import { parseUtcEpoch } from "./utcEpoch";

describe("UTC orbital epochs", () => {
  it("interprets offset-free OMM as UTC including microseconds", () => {
    expect(parseUtcEpoch("2026-08-06T00:00:00.123456")).toBe(Date.UTC(2026, 7, 6, 0, 0, 0, 123));
    expect(parseUtcEpoch("2026-08-06T03:00:00+03:00")).toBe(parseUtcEpoch("2026-08-06T00:00:00Z"));
  });
  it.each(["", "2026-02-30T00:00:00", "08/06/2026", "2026-08-06T25:00:00"])("rejects %s", (value) => {
    expect(Number.isNaN(parseUtcEpoch(value))).toBe(true);
  });
});
