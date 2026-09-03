import { expect, it } from "vitest";
import { compareSemanticVersions, isSemanticVersion } from "./semver";

it("follows numeric and lexical prerelease ordering without numeric overflow", () => {
  const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
  for (let i = 1; i < order.length; i++) expect(compareSemanticVersions(order[i - 1]!, order[i]!)).toBe(-1);
  expect(compareSemanticVersions("1.2.3+a", "1.2.3+b")).toBe(0);
  expect(compareSemanticVersions("1.0.0-99999999999999999999", "1.0.0-999999999999999999999")).toBe(-1);
});

it.each(["1.0.0-01", "01.2.3", "1.2", "1.0.0-alpha..2", "1.0.0-"])("rejects malformed version %s", (version) => {
  expect(isSemanticVersion(version)).toBe(false);
  expect(() => compareSemanticVersions(version, "1.0.0")).toThrow();
});
