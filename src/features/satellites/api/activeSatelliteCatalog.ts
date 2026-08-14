import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  createSatelliteCatalog,
  type SatelliteCatalog,
} from "../domain/satellite";

const responseSchema = z.object({
  catalogData: z.array(z.unknown()),
  catalogObjectCount: z.number().int().nonnegative(),
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  orbitalData: z.array(z.unknown()),
  orbitalObjectCount: z.number().int().nonnegative(),
  source: z.string(),
  stale: z.boolean(),
});

export async function fetchActiveSatelliteCatalog(): Promise<SatelliteCatalog> {
  const response = responseSchema.parse(
    await invoke("active_satellite_catalog"),
  );
  return createSatelliteCatalog(response.orbitalData, response.catalogData, {
    catalogObjectCount: response.catalogObjectCount,
    expiresAt: new Date(response.expiresAtUnixMs).toISOString(),
    fetchedAt: new Date(response.fetchedAtUnixMs).toISOString(),
    source: response.source,
    stale: response.stale,
  });
}

