import { describe, expect, it } from "vitest";

import {
  formatDistanceFromKm,
  formatForceFromKilonewtons,
  formatLengthFromMeters,
  formatMassFromKilograms,
  formatMassFromTonnes,
  formatOrbitalSpeed,
  formatTemperature,
} from "./units";

describe("unit formatting", () => {
  it("converts distance and orbital speed without changing source values", () => {
    expect(formatDistanceFromKm(100, "imperial", "en", 1)).toBe("62.1 mi");
    expect(formatOrbitalSpeed(8, "imperial", "en", 2)).toBe("4.97 mi/s");
  });

  it("converts temperature for imperial presentation", () => {
    expect(formatTemperature(20, "imperial", "en")).toBe("68°F");
    expect(formatTemperature(20, "metric", "en")).toBe("20°C");
  });

  it("applies the selected system to rocket dimensions without mutating source values", () => {
    expect(formatLengthFromMeters(10, "imperial", "en", 1)).toBe("32.8 ft");
    expect(formatMassFromKilograms(1_000, "imperial", "en", 0)).toBe("2,205 lb");
    expect(formatMassFromTonnes(10, "imperial", "en", 1)).toBe("11 short ton");
    expect(formatForceFromKilonewtons(1, "imperial", "en", 0)).toBe("225 lbf");
  });
});
