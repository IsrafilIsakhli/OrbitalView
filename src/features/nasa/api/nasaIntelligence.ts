import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

import {
  createNasaIntelligence,
  providerStatusSchema,
  type NasaIntelligence,
} from "../domain/nasa";

const diagnosticsSchema = z.object({
  cacheHit: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  errorType: z.string().nullable(),
  provider: z.string().min(1),
  request: z.string().min(1),
  retryCount: z.number().int().nonnegative(),
  status: providerStatusSchema,
});

const componentSchema = z.object({
  data: z.unknown(),
  diagnostics: diagnosticsSchema,
  expiresAtUnixMs: z.number().int().nonnegative(),
  fetchedAtUnixMs: z.number().int().nonnegative(),
  rateLimitRemaining: z.number().int().nonnegative().nullable(),
  source: z.string().min(1),
  stale: z.boolean(),
  status: providerStatusSchema,
});

const responseSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apod: componentSchema,
  cmes: componentSchema,
  flares: componentSchema,
  neo: componentSchema,
  retrievedAtUnixMs: z.number().int().nonnegative(),
  storms: componentSchema,
});

export async function fetchNasaIntelligence(): Promise<NasaIntelligence> {
  return createNasaIntelligence(responseSchema.parse(await invoke("nasa_intelligence")));
}
