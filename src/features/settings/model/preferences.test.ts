import { describe, expect, it } from "vitest";

import {
  defaultPreferences,
  migratePreferences,
  preferencesSchema,
} from "./preferences";

describe("preferencesSchema", () => {
  it("accepts a complete production preference set", () => {
    const result = preferencesSchema.safeParse({
      backgroundSync: true,
      defaultCameraPreset: "earth",
      graphicsQuality: "balanced",
      locale: "az",
      reduceMotion: true,
      timeDisplay: "utc-local",
      units: "metric",
    });

    expect(result.success).toBe(true);
  });

  it("rejects corrupt persisted settings", () => {
    const result = preferencesSchema.safeParse({
      backgroundSync: true,
      defaultCameraPreset: "earth",
      graphicsQuality: "cinematic",
      locale: "unsupported",
      reduceMotion: "sometimes",
      timeDisplay: "utc-local",
      units: "metric",
    });

    expect(result.success).toBe(false);
  });

  it("migrates v1 preferences without losing supported user choices", () => {
    expect(migratePreferences({
      graphicsQuality: "high",
      locale: "es",
      reduceMotion: true,
      units: "imperial",
    })).toEqual({
      ...defaultPreferences,
      graphicsQuality: "high",
      locale: "es",
      reduceMotion: true,
      units: "imperial",
    });
  });
});
