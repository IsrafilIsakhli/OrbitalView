import { describe, expect, it } from "vitest";

import { compareSemanticVersions, parseUpdatePolicy } from "./updatePolicy";

const policy = JSON.stringify({
  minimumSupportedVersion: "1.4.0",
  notes: { az: "AZ", en: "EN", es: "ES", ru: "RU", tr: "TR" },
  schemaVersion: 1,
  severity: "optional",
  version: "1.5.0",
});

describe("update policy", () => {
  it("rejects damaged or mismatched structured policy instead of making it optional", () => {
    expect(() => parseUpdatePolicy("{broken", "1.0.0", "1.1.0", "en")).toThrow();
    expect(() => parseUpdatePolicy(policy, "1.4.0", "1.6.0", "en")).toThrow();
  });

  it("requires the minimum stable version when the installation is a prerelease", () => {
    expect(parseUpdatePolicy(policy, "1.4.0-rc.1", "1.5.0", "en").required).toBe(true);
  });
  it("compares ordinary semantic versions", () => {
    expect(compareSemanticVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemanticVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareSemanticVersions("1.1.9", "1.2.0")).toBe(-1);
  });

  it("forces users below the minimum supported version", () => {
    expect(parseUpdatePolicy(policy, "1.3.9", "1.5.0", "az")).toEqual({
      minimumSupportedVersion: "1.4.0",
      notes: "AZ",
      required: true,
      severity: "critical",
    });
  });

  it("keeps a normal update optional for supported users", () => {
    expect(parseUpdatePolicy(policy, "1.4.0", "1.5.0", "tr").required).toBe(false);
  });

  it("treats invalid policy metadata as an optional legacy release", () => {
    expect(parseUpdatePolicy("Release notes", "1.0.0", "1.1.0", "en")).toMatchObject({
      notes: "Release notes",
      required: false,
    });
  });
});
