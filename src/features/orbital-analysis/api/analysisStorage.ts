import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import type { GroundStationProfile } from "../domain/analysis";

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
    await invoke("save_analysis_ground_station", { request }),
  );
}

export async function deleteAnalysisGroundStation(id: string): Promise<boolean> {
  return z.boolean().parse(await invoke("delete_analysis_ground_station", { id }));
}

export async function exportOrbitalAnalysis(input: {
  content: string;
  format: "csv" | "json";
  suggestedName: string;
}): Promise<{ path: string | null; saved: boolean }> {
  return exportResultSchema.parse(
    await invoke("export_orbital_analysis", { request: input }),
  );
}
