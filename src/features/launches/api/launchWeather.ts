import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import { createLaunchWeather, type LaunchWeather } from "../domain/weather";

const responseSchema = z.object({
  data: z.unknown(),
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  source: z.string(),
  stale: z.boolean(),
});

export async function fetchLaunchWeather(
  latitude: number,
  longitude: number,
): Promise<LaunchWeather> {
  const response = responseSchema.parse(
    await invoke("launch_weather", { latitude, longitude }),
  );
  return createLaunchWeather(response.data, {
    expiresAt: new Date(response.expiresAtUnixMs).toISOString(),
    fetchedAt: new Date(response.fetchedAtUnixMs).toISOString(),
    source: response.source,
    stale: response.stale,
  });
}
