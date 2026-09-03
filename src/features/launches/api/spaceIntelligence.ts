import { nativeSnapshot } from "@/shared/data/nativeSnapshot";
import { z } from "zod";

import {
  createSpaceIntelligence,
  type SpaceIntelligence,
} from "../domain/launch";

const responseSchema = z.object({
  eventCount: z.number().int().nonnegative(),
  eventsData: z.array(z.unknown()),
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  launchCount: z.number().int().nonnegative(),
  launchProviderCount: z.number().int().nonnegative().optional(),
  launchesData: z.array(z.unknown()),
  source: z.string(),
  stale: z.boolean(),
});

export async function fetchSpaceIntelligence(): Promise<SpaceIntelligence> {
  const response = responseSchema.parse(await nativeSnapshot("launchLibrary", "space_intelligence"));
  return createSpaceIntelligence(response.launchesData, response.eventsData, {
    eventCount: response.eventCount,
    expiresAt: new Date(response.expiresAtUnixMs).toISOString(),
    fetchedAt: new Date(response.fetchedAtUnixMs).toISOString(),
    launchCount: response.launchProviderCount ?? response.launchCount,
    source: response.source,
    stale: response.stale,
  });
}
