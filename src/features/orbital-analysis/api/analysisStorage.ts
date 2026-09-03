import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { trackLocalWrite } from "@/features/updater/domain/updateBarrier";

import type { GroundStationProfile, OrbitalElementSnapshot } from "../domain/analysis";

const stationSchema = z.object({
  altitudeMeters: z.number().min(-500).max(10_000),
  createdAt: z.string().datetime(),
  downlinkFrequencyHz: z.number().positive().max(1e12).nullable(),
  id: z.string().min(1),
  latitudeDegrees: z.number().min(-90).max(90),
  longitudeDegrees: z.number().min(-180).max(180),
  minimumElevationDegrees: z.number().min(0).max(90),
  name: z.string().min(1).max(80),
  updatedAt: z.string().datetime(),
});

const exportResultSchema = z.object({
  path: z.string().nullable(),
  saved: z.boolean(),
});

const orbitalSnapshotSchema = z.object({
  apogeeKm: z.number().finite().nullable(),
  argumentPerigeeDegrees: z.number().finite(),
  bstar: z.number().finite().nullable(),
  capturedAtUnixMs: z.number().int().positive(),
  eccentricity: z.number().min(0).max(1),
  inclinationDegrees: z.number().min(0).max(180),
  meanAnomalyDegrees: z.number().finite(),
  meanMotion: z.number().positive(),
  noradId: z.string().regex(/^\d{1,6}$/),
  perigeeKm: z.number().finite().nullable(),
  raanDegrees: z.number().finite(),
  sourceEpochUnixMs: z.number().int().positive(),
});

export interface RecordOrbitalSnapshotInput {
  apogeeKm: number | null;
  argumentPerigeeDegrees: number;
  bstar: number | null;
  eccentricity: number;
  inclinationDegrees: number;
  meanAnomalyDegrees: number;
  meanMotion: number;
  noradId: string;
  perigeeKm: number | null;
  raanDegrees: number;
  sourceEpochUnixMs: number;
}

export type SaveGroundStationInput = Omit<
  GroundStationProfile,
  "createdAt" | "id" | "updatedAt"
> & { id?: string };

export async function fetchAnalysisGroundStations(): Promise<GroundStationProfile[]> {
  return z.array(stationSchema).parse(await invoke("analysis_ground_stations"));
}

export async function saveAnalysisGroundStation(
  request: SaveGroundStationInput,
): Promise<GroundStationProfile> {
  return stationSchema.parse(
    await trackLocalWrite(() => invoke("save_analysis_ground_station", { request })),
  );
}

export async function deleteAnalysisGroundStation(id: string): Promise<boolean> {
  return z.boolean().parse(await trackLocalWrite(() => invoke("delete_analysis_ground_station", { id })));
}

export async function exportOrbitalAnalysis(input: {
  content: string;
  format: "csv" | "json";
  suggestedName: string;
}): Promise<{ path: string | null; saved: boolean }> {
  return exportResultSchema.parse(
    await trackLocalWrite(() => invoke("export_orbital_analysis", { request: input })),
  );
}

export async function recordAnalysisOrbitalSnapshot(
  request: RecordOrbitalSnapshotInput,
): Promise<OrbitalElementSnapshot> {
  return orbitalSnapshotSchema.parse(
    await trackLocalWrite(() => invoke("record_analysis_orbital_snapshot", { request })),
  );
}

export async function fetchAnalysisOrbitalHistory(
  noradId: string,
): Promise<OrbitalElementSnapshot[]> {
  return z.array(orbitalSnapshotSchema).parse(
    await invoke("analysis_orbital_history", { limit: 512, noradId }),
  );
}
