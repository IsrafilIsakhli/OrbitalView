import { describe, expect, it } from "vitest";

import {
  applyDesktopPlatformAttribute,
  normalizeDesktopPlatform,
  usesNativeWindowFrame,
} from "./desktopPlatform";

describe("desktop platform", () => {
  it.each([
    ["win32", "windows"],
    ["windows", "windows"],
    ["darwin", "macos"],
    ["macos", "macos"],
    ["linux", "linux"],
    ["freebsd", "unknown"],
  ] as const)("normalizes %s", (input, expected) => {
    expect(normalizeDesktopPlatform(input)).toBe(expected);
  });

  it("uses native frames outside Windows", () => {
    expect(usesNativeWindowFrame("windows")).toBe(false);
    expect(usesNativeWindowFrame("macos")).toBe(true);
    expect(usesNativeWindowFrame("linux")).toBe(true);
  });

  it("exposes the platform to CSS", () => {
    applyDesktopPlatformAttribute("macos");
    expect(document.documentElement.dataset.platform).toBe("macos");
  });
});
