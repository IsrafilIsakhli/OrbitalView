import type { CameraPresetId } from "../contracts/earth-engine";

export interface CameraPresetDefinition {
  durationSeconds: number;
  headingDegrees: number;
  heightMeters: number;
  latitudeDegrees: number;
  longitudeDegrees: number;
  pitchDegrees: number;
  targetEarthOccupancy?: number;
}

export const cameraPresets: Record<CameraPresetId, CameraPresetDefinition> = {
  earth: {
    durationSeconds: 2.1,
    headingDegrees: 8,
    heightMeters: 8_900_000,
    latitudeDegrees: 10,
    longitudeDegrees: -18,
    pitchDegrees: -90,
    targetEarthOccupancy: 0.76,
  },
  leo: {
    durationSeconds: 2.35,
    headingDegrees: 12,
    heightMeters: 1_450_000,
    latitudeDegrees: 20,
    longitudeDegrees: 12,
    pitchDegrees: -54,
  },
  iss: {
    durationSeconds: 2.5,
    headingDegrees: 18,
    heightMeters: 360_000,
    latitudeDegrees: 12,
    longitudeDegrees: -12,
    pitchDegrees: -34,
  },
  moon: {
    durationSeconds: 3.4,
    headingDegrees: 0,
    heightMeters: 384_400_000,
    latitudeDegrees: 18,
    longitudeDegrees: 8,
    pitchDegrees: -90,
  },
  sun: {
    durationSeconds: 3.8,
    headingDegrees: 0,
    heightMeters: 149_597_870_700,
    latitudeDegrees: 0,
    longitudeDegrees: 0,
    pitchDegrees: -90,
  },
};
