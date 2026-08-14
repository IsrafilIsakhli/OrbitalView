import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import { createRocketRecord, type RocketRecord } from "../domain/launch";

const responseSchema = z.object({
  data: z.unknown(),
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  source: z.string(),
  stale: z.boolean(),
});

export interface RocketIntelligence {
  expiresAt: string;
  fetchedAt: string;
  rocket: RocketRecord;
  source: string;
  stale: boolean;
}

export async function fetchRocketConfiguration(
  configurationId: string,
): Promise<RocketIntelligence> {
  const numericId = Number(configurationId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error("Invalid rocket configuration ID");
  }
  const response = responseSchema.parse(await invoke("rocket_configuration", {
    configurationId: numericId,
  }));
  const rocket = createRocketRecord(response.data);
  if (!rocket) throw new Error("Launch Library returned an invalid rocket configuration");
  return {
    expiresAt: new Date(response.expiresAtUnixMs).toISOString(),
    fetchedAt: new Date(response.fetchedAtUnixMs).toISOString(),
    rocket,
    source: response.source,
    stale: response.stale,
  };
}
