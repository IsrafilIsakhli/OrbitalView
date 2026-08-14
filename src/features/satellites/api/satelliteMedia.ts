import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  satelliteMediaStates,
  type SatelliteObjectMedia,
} from "../domain/satelliteMedia";

const satelliteMediaSchema = z.object({
  cachedPath: z.string().min(1).nullable(),
  commonsPageUrl: z.string().url().nullable(),
  creator: z.string().nullable(),
  fetchedAtUnixMs: z.number().int().nonnegative().nullable(),
  licenseName: z.string().nullable(),
  licenseUrl: z.string().url().nullable(),
  noradId: z.string().regex(/^\d{5,6}$/),
  state: z.enum(satelliteMediaStates),
});

export async function fetchSatelliteObjectMedia(
  noradId: string,
): Promise<SatelliteObjectMedia> {
  return satelliteMediaSchema.parse(
    await invoke("satellite_object_media", { noradId }),
  );
}

export function satelliteMediaAssetUrl(cachedPath: string): string {
  return convertFileSrc(cachedPath);
}
