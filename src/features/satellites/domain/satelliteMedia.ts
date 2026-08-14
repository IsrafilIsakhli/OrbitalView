export const satelliteMediaStates = [
  "available",
  "pending",
  "unavailable",
  "disabled",
] as const;

export type SatelliteMediaState = (typeof satelliteMediaStates)[number];

export interface SatelliteObjectMedia {
  cachedPath: string | null;
  commonsPageUrl: string | null;
  creator: string | null;
  fetchedAtUnixMs: number | null;
  licenseName: string | null;
  licenseUrl: string | null;
  noradId: string;
  state: SatelliteMediaState;
}
