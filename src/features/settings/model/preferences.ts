import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getInitialLocale } from "@/shared/i18n/locales";

export const preferencesSchema = z.object({
  backgroundSync: z.boolean(),
  defaultCameraPreset: z.enum(["earth", "leo", "iss", "moon", "sun"]),
  graphicsQuality: z.enum(["eco", "balanced", "high"]),
  earthFrameRateMode: z.enum(["60", "120"]).default("60"),
  earthLayerDrawerOpen: z.boolean().default(false),
  locale: z.enum(["az", "tr", "en", "ru", "es"]),
  reduceMotion: z.boolean(),
  timeDisplay: z.enum(["utc-local", "utc-only", "local-only"]),
  units: z.enum(["metric", "imperial"]),
});

export type Preferences = z.infer<typeof preferencesSchema>;
export type GraphicsQuality = Preferences["graphicsQuality"];
export type EarthFrameRateMode = Preferences["earthFrameRateMode"];
export type DefaultCameraPreset = Preferences["defaultCameraPreset"];
export type TimeDisplayMode = Preferences["timeDisplay"];
export type UnitSystem = Preferences["units"];

interface PreferencesActions {
  setBackgroundSync: (enabled: boolean) => void;
  setDefaultCameraPreset: (preset: DefaultCameraPreset) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setEarthFrameRateMode: (mode: EarthFrameRateMode) => void;
  setEarthLayerDrawerOpen: (open: boolean) => void;
  setLocale: (locale: Preferences["locale"]) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setTimeDisplay: (mode: TimeDisplayMode) => void;
  setUnits: (units: UnitSystem) => void;
}

type PreferencesStore = Preferences & PreferencesActions;

export const defaultPreferences: Preferences = {
  backgroundSync: true,
  defaultCameraPreset: "earth",
  graphicsQuality: "high",
  earthFrameRateMode: "60",
  earthLayerDrawerOpen: false,
  locale: getInitialLocale(),
  reduceMotion: false,
  timeDisplay: "utc-local",
  units: "metric",
};

export function migratePreferences(persistedState: unknown): Preferences {
  const result = preferencesSchema.partial().safeParse(persistedState);
  if (!result.success) return defaultPreferences;
  return {
    backgroundSync: result.data.backgroundSync ?? defaultPreferences.backgroundSync,
    defaultCameraPreset:
      result.data.defaultCameraPreset ?? defaultPreferences.defaultCameraPreset,
    graphicsQuality: result.data.graphicsQuality ?? defaultPreferences.graphicsQuality,
    earthFrameRateMode: result.data.earthFrameRateMode ?? "60",
    earthLayerDrawerOpen: result.data.earthLayerDrawerOpen ?? false,
    locale: result.data.locale ?? defaultPreferences.locale,
    reduceMotion: result.data.reduceMotion ?? defaultPreferences.reduceMotion,
    timeDisplay: result.data.timeDisplay ?? defaultPreferences.timeDisplay,
    units: result.data.units ?? defaultPreferences.units,
  };
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      setBackgroundSync: (backgroundSync) => set({ backgroundSync }),
      setDefaultCameraPreset: (defaultCameraPreset) => set({ defaultCameraPreset }),
      setGraphicsQuality: (graphicsQuality) => set({ graphicsQuality }),
      setEarthFrameRateMode: (earthFrameRateMode) => set({ earthFrameRateMode }),
      setEarthLayerDrawerOpen: (earthLayerDrawerOpen) => set({ earthLayerDrawerOpen }),
      setLocale: (locale) => set({ locale }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTimeDisplay: (timeDisplay) => set({ timeDisplay }),
      setUnits: (units) => set({ units }),
    }),
    {
      merge: (persistedState, currentState) => {
        const result = preferencesSchema.partial().safeParse(persistedState);
        return result.success
          ? {
              ...currentState,
              backgroundSync:
                result.data.backgroundSync ?? currentState.backgroundSync,
              defaultCameraPreset:
                result.data.defaultCameraPreset ?? currentState.defaultCameraPreset,
              graphicsQuality:
                result.data.graphicsQuality ?? currentState.graphicsQuality,
              earthFrameRateMode: result.data.earthFrameRateMode ?? currentState.earthFrameRateMode,
              earthLayerDrawerOpen: result.data.earthLayerDrawerOpen ?? currentState.earthLayerDrawerOpen,
              locale: result.data.locale ?? currentState.locale,
              reduceMotion:
                result.data.reduceMotion ?? currentState.reduceMotion,
              timeDisplay: result.data.timeDisplay ?? currentState.timeDisplay,
              units: result.data.units ?? currentState.units,
            }
          : currentState;
      },
      migrate: (persistedState) => migratePreferences(persistedState),
      name: "orbital-vision.preferences",
      partialize: ({
        earthFrameRateMode,
        earthLayerDrawerOpen,
        backgroundSync,
        defaultCameraPreset,
        graphicsQuality,
        locale,
        reduceMotion,
        timeDisplay,
        units,
      }) => ({
        earthFrameRateMode,
        earthLayerDrawerOpen,
        backgroundSync,
        defaultCameraPreset,
        graphicsQuality,
        locale,
        reduceMotion,
        timeDisplay,
        units,
      }),
      storage: createJSONStorage(() => window.localStorage),
      version: 4,
    },
  ),
);
