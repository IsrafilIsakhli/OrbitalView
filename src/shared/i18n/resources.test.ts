import { describe, expect, it } from "vitest";

import { resources } from "./resources";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, nestedValue]) =>
    flattenKeys(nestedValue, prefix ? `${prefix}.${key}` : key),
  );
}

describe("localization resources", () => {
  it("keeps every locale structurally identical to English", () => {
    const expectedKeys = flattenKeys(resources.en).sort();

    expect(flattenKeys(resources.az).sort()).toEqual(expectedKeys);
    expect(flattenKeys(resources.ru).sort()).toEqual(expectedKeys);
    expect(flattenKeys(resources.es).sort()).toEqual(expectedKeys);
    expect(flattenKeys(resources.tr).sort()).toEqual(expectedKeys);
  });
});
